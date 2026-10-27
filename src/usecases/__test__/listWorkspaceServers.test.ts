import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { ListWorkspaceServersUseCase } from '../listWorkspaceServers.js';
import type { ServerService, Server } from '../../lib/servers.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import type { RunningPane } from '../../lib/sessionManager.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('ListWorkspaceServersUseCase', () => {
  let servers: sinon.SinonStubbedInstance<ServerService>;
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let useCase: ListWorkspaceServersUseCase;

  const server = (pid: number, cwd: string, ports = [3000], command = 'node'): Server => ({ pid, command, ports, cwd });
  const params = { sourcePath: '/dev', destPath: '/dev/.workspaces' };

  beforeEach(() => {
    servers = { listListening: sinon.stub().resolves([]) } as any;
    workspaceDir = {
      // Workspaces are the folders directly under dest-path, except those without a flow-config.json
      detectWorkspace: sinon.stub().callsFake((cwd: string, dest: string) => {
        const match = cwd.match(new RegExp(`^${dest}/([^/]+)`));
        return match && match[1] !== 'not-a-workspace' ? `${dest}/${match[1]}` : null;
      }),
    } as any;
    workspaceConfig = {
      getBranchName: sinon.stub().callsFake((ws: string) => (ws.endsWith('feature_a') ? 'feature/a' : undefined)),
    } as any;
    useCase = new ListWorkspaceServersUseCase(servers, workspaceDir, workspaceConfig);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('keeps only servers running inside the source or dest paths', async () => {
    servers.listListening.resolves([
      server(1, '/dev/.workspaces/feature_a/web'),
      server(2, '/usr/local/var/postgres', [5432], 'postgres'),
      server(3, '/dev/api', [8080]),
      server(4, '/'),
      server(6, '/dev'),
      server(5, '/devtools/app'),
    ]);

    const result = await useCase.execute(params);

    expect(result.map((s) => s.pid).sort()).toEqual([1, 3]);
  });

  it('names a workspace server after its branch, so its session can be switched to', async () => {
    servers.listListening.resolves([server(1, '/dev/.workspaces/feature_a/web/packages/app')]);

    const [result] = await useCase.execute(params);

    expect(result).toEqual({
      pid: 1,
      command: 'node',
      ports: [3000],
      cwd: '/dev/.workspaces/feature_a/web/packages/app',
      name: 'feature/a',
      workspacePath: '/dev/.workspaces/feature_a',
      pane: null,
    });
  });

  it('falls back to the folder name for a workspace without a persisted branch', async () => {
    servers.listListening.resolves([server(1, '/dev/.workspaces/old_one/web')]);

    const [result] = await useCase.execute(params);

    expect(result).toMatchObject({ name: 'old_one', workspacePath: '/dev/.workspaces/old_one' });
  });

  it('names a source server after its repo, with no workspace to switch to', async () => {
    servers.listListening.resolves([server(1, '/dev/api/cmd/server')]);

    const [result] = await useCase.execute(params);

    expect(result).toMatchObject({ name: 'api', workspacePath: null });
  });

  it('trims servers in the dest path that are not inside a workspace', async () => {
    servers.listListening.resolves([server(1, '/dev/.workspaces'), server(2, '/dev/.workspaces/not-a-workspace')]);

    expect(await useCase.execute(params)).toEqual([]);
  });

  it('handles a dest path outside the source path', async () => {
    servers.listListening.resolves([server(1, '/work/feature_a/web'), server(2, '/dev/api')]);

    const result = await useCase.execute({ sourcePath: '/dev', destPath: '/work' });

    expect(result.map((s) => [s.name, s.workspacePath])).toEqual([
      ['feature/a', '/work/feature_a'],
      ['api', null],
    ]);
  });

  it('lists workspace servers first, then source servers, each by name then port', async () => {
    servers.listListening.resolves([
      server(1, '/dev/web', [3000]),
      server(2, '/dev/.workspaces/zeta/web', [4000]),
      server(3, '/dev/api', [8080]),
      server(4, '/dev/.workspaces/feature_a/web', [5173]),
      server(5, '/dev/.workspaces/feature_a/api', [3001]),
    ]);

    const result = await useCase.execute(params);

    expect(result.map((s) => s.pid)).toEqual([5, 4, 2, 3, 1]);
  });

  describe('finding the pane each server runs in', () => {
    const pane = (paneId: string, fields: Partial<RunningPane> = {}): RunningPane => ({
      paneId,
      tabId: `${paneId.split(':')[0]}:t1`,
      location: `${paneId} › 1`,
      foregroundPids: [],
      ...fields,
    });
    const withPanes = (panes: RunningPane[]) =>
      Object.assign(createMockSessionManager('herdr'), { listRunningPanes: sinon.stub().resolves(panes) });

    it('matches the pane whose foreground process group the server is in, e.g. under npm run dev', async () => {
      servers.listListening.resolves([{ ...server(701, '/dev/homelab'), pgid: 700 }]);
      const sessions = withPanes([
        pane('w1:p1', { foregroundCwd: '/dev/homelab', foregroundProcessGroupId: 555 }),
        pane('w1:p3', { foregroundCwd: '/dev/homelab/web', foregroundProcessGroupId: 700, foregroundPids: [700] }),
      ]);

      const [result] = await useCase.execute({ ...params, sessions });

      expect(result.pane?.paneId).toBe('w1:p3');
    });

    it('matches the pane with the server among its foreground processes', async () => {
      servers.listListening.resolves([server(701, '/dev/homelab')]);
      const sessions = withPanes([pane('w1:p1'), pane('w2:p1', { foregroundPids: [700, 701] })]);

      const [result] = await useCase.execute({ ...params, sessions });

      expect(result.pane?.paneId).toBe('w2:p1');
    });

    it('matches the pane whose shell started the server in the background', async () => {
      // Started with &, so it left the foreground group; another pane sits in the same folder
      servers.listListening.resolves([{ ...server(900, '/dev/web'), pgid: 900, ppid: 34690 }]);
      const sessions = withPanes([
        pane('w3:p1', { foregroundCwd: '/dev/web', shellPid: 34500, foregroundProcessGroupId: 34500 }),
        pane('w6:p1', { foregroundCwd: '/dev/web', shellPid: 34690, foregroundProcessGroupId: 34690 }),
      ]);

      const [result] = await useCase.execute({ ...params, sessions });

      expect(result.pane?.paneId).toBe('w6:p1');
    });

    it('falls back to a pane whose foreground is in the server cwd', async () => {
      // e.g. started with nohup and the shell has since exited, so it has no pane-related parent
      servers.listListening.resolves([{ ...server(900, '/dev/.workspaces/feature_a/web'), pgid: 900 }]);
      const sessions = withPanes([
        pane('w1:p1', { foregroundCwd: '/dev/.workspaces/feature_a' }),
        pane('w1:p2', { foregroundCwd: '/dev/.workspaces/feature_a/web' }),
      ]);

      const [result] = await useCase.execute({ ...params, sessions });

      expect(result.pane?.paneId).toBe('w1:p2');
    });

    it('finds no pane when none matches, or the session manager cannot list panes', async () => {
      servers.listListening.resolves([server(1, '/dev/api')]);

      const [unmatched] = await useCase.execute({ ...params, sessions: withPanes([pane('w1:p1', { foregroundCwd: '/dev/web' })]) });
      const [tmux] = await useCase.execute({ ...params, sessions: createMockSessionManager('tmux') });

      expect(unmatched.pane).toBeNull();
      expect(tmux.pane).toBeNull();
    });
  });
});
