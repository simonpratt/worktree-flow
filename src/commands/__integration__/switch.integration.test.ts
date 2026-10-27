import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import sinon from 'sinon';
import { runSwitch } from '../switch.js';
import { pickOne, type PickOneOptions } from '../prompts.js';
import { SessionManagers, type SessionManagerKind } from '../../lib/sessionManager.js';
import { TmuxService } from '../../lib/tmux.js';
import { HerdrService } from '../../lib/herdr.js';
import { ServerService } from '../../lib/servers.js';
import { createUseCases } from '../../usecases/usecases.js';
import { PromptCancelledError, WorkspaceNotFoundError } from '../../lib/errors.js';
import { createMockShell } from '../../test/test-utils.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

const ENTER = '\r';
const ESC = '\x1b';

describe('switch integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let shell: ReturnType<typeof createMockShell>;
  /** The shell lsof runs in, kept apart from the session manager's */
  let lsofShell: ReturnType<typeof createMockShell>;
  let env: Record<string, string>;
  /** Keys typed into the picker; it is driven through in-memory streams */
  let keys: string[];
  let pickOneSpy: sinon.SinonSpy<[PickOneOptions], Promise<string>>;

  /** A fake tmux CLI: tracks live sessions and the session switched to. */
  function fakeTmux(sessions: string[] = []) {
    const state = { live: new Set(sessions), switchedTo: undefined as string | undefined, panes: [] as string[] };
    shell.execFile.callsFake(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('tmux');
      const target = args[args.indexOf('-t') + 1];
      const exact = target?.replace(/^=/, '').replace(/:$/, '');
      switch (args[0]) {
        case 'new-session':
          state.live.add(args[args.indexOf('-s') + 1]);
          return { stdout: '', stderr: '' };
        case 'split-window':
          state.panes.push(args[args.indexOf('-c') + 1]);
          return { stdout: `%${state.panes.length}`, stderr: '' };
        case 'select-layout':
          return { stdout: '', stderr: '' };
        case 'has-session':
        case 'switch-client':
          if (!state.live.has(exact)) throw new Error(`can't find session: ${target}`);
          if (args[0] === 'switch-client') state.switchedTo = exact;
          return { stdout: '', stderr: '' };
      }
      throw new Error(`unexpected tmux call: ${args.join(' ')}`);
    });
    return state;
  }

  type FakeHerdrPane = {
    pane_id: string;
    tab_id: string;
    tab_label: string;
    cwd: string;
    /** The process group in the foreground and its processes, which run in `cwd` */
    pgid: number;
    pids: number[];
  };

  /** A fake herdr CLI with existing workspaces and panes, tracking the workspace and tab focused. */
  function fakeHerdr(workspaces: Array<{ workspace_id: string; label: string }>, panes: FakeHerdrPane[] = []) {
    const state = { focused: undefined as string | undefined, focusedTab: undefined as string | undefined };
    const ok = (result: any) => ({ stdout: JSON.stringify({ id: 'cli', result }), stderr: '' });
    const workspaceOf = (pane: FakeHerdrPane) => pane.pane_id.split(':')[0];
    shell.execFile.callsFake(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('herdr');
      if (args[0] === 'workspace' && args[1] === 'list') return ok({ type: 'workspace_list', workspaces });
      if (args[0] === 'tab' && args[1] === 'list') {
        const tabs = panes
          .filter((p) => workspaceOf(p) === args[3])
          .map((p) => ({ tab_id: p.tab_id, workspace_id: workspaceOf(p), label: p.tab_label }));
        return ok({ type: 'tab_list', tabs });
      }
      if (args[0] === 'tab' && args[1] === 'focus') {
        state.focusedTab = args[2];
        return ok({ type: 'tab_info', tab: { tab_id: args[2] } });
      }
      if (args[0] === 'pane' && args[1] === 'list') {
        return ok({
          type: 'pane_list',
          panes: panes.map((p) => ({
            pane_id: p.pane_id,
            tab_id: p.tab_id,
            workspace_id: workspaceOf(p),
            cwd: p.cwd,
            foreground_cwd: p.cwd,
          })),
        });
      }
      if (args[0] === 'pane' && args[1] === 'process-info') {
        const pane = panes.find((p) => p.pane_id === args[3])!;
        return ok({
          type: 'pane_process_info',
          process_info: {
            pane_id: pane.pane_id,
            shell_pid: pane.pgid,
            foreground_process_group_id: pane.pgid,
            foreground_processes: pane.pids.map((pid) => ({ pid, name: 'node', argv: ['node'], cwd: pane.cwd })),
          },
        });
      }
      if (args[0] === 'workspace' && args[1] === 'focus') {
        state.focused = args[2];
        return ok({ type: 'workspace_info', workspace: workspaces.find((w) => w.workspace_id === args[2]) });
      }
      throw new Error(`unexpected herdr call: ${args.join(' ')}`);
    });
    return state;
  }

  /** A fake lsof reporting the given processes as listening, each in its cwd. */
  function fakeLsof(processes: Array<{ pid: number; pgid?: number; command: string; ports: number[]; cwd: string }>) {
    lsofShell.execFile.callsFake(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('lsof');
      const lines = args.includes('-sTCP:LISTEN')
        ? processes.flatMap((p) => [
            `p${p.pid}`,
            `g${p.pgid ?? p.pid}`,
            `c${p.command}`,
            ...p.ports.flatMap((port) => ['f20', `n*:${port}`]),
          ])
        : processes.flatMap((p) => [`p${p.pid}`, 'fcwd', `n${p.cwd}`]);
      return { stdout: lines.join('\n'), stderr: '' };
    });
  }

  function setup(sessionManager: SessionManagerKind) {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.services.config.load as sinon.SinonStub).returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      sessionManager,
      postCheckout: 'echo should-not-run',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      repoGroups: {},
    });
    // The real session managers, with only their CLIs faked
    integration.services.sessionManagers = new SessionManagers({
      tmux: new TmuxService(shell),
      herdr: new HerdrService(shell, async () => {}),
    });
    (integration.services.process.env as sinon.SinonStub).callsFake((name: string) => env[name]);
    integration.services.servers = new ServerService(lsofShell);
    integration.useCases = createUseCases(integration.services);
  }

  async function createWorkspace(branchName: string, repos: string[]) {
    return createTestWorkspace(integration.useCases, {
      repos,
      branchName,
      sourceBranch: 'master',
      sourcePath,
      destPath,
    });
  }

  const run = (name?: string, options: { servers?: boolean } = {}) =>
    runSwitch(name, integration.useCases, integration.services, { pickOne: pickOneSpy }, options);

  const logs = () => (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0] as string);

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    shell = createMockShell();
    lsofShell = createMockShell();
    env = {};
    keys = [];
    pickOneSpy = sinon.spy(async (opts: PickOneOptions) => {
      const streams = { input: new PassThrough(), output: new PassThrough() };
      streams.output.resume();
      const answer = pickOne(opts, streams);
      for (const key of keys) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        streams.input.write(key);
      }
      return answer;
    });
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should explain how to configure a session manager when none is set', async () => {
    setup('none');

    await expect(run('feature-a')).rejects.toThrow(
      'No session manager configured. Run:\n  flow config set session-manager <tmux|herdr>'
    );
  });

  it('should switch the tmux client to the workspace session, named after its real branch', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    await createWorkspace('feature/a', [repo1]);
    const tmux = fakeTmux(['feature/a', 'feature/a-2']);

    await run('feature/a');

    expect(tmux.switchedTo).toBe('feature/a');
    expect(logs()).toEqual([]);
  });

  it('should focus the herdr workspace labelled with the branch', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('herdr');
    env.HERDR_ENV = '1';
    await createWorkspace('feature-b', [repo1]);
    const herdr = fakeHerdr([
      { workspace_id: 'w1', label: 'feature-a' },
      { workspace_id: 'w2', label: 'feature-b' },
    ]);

    await run('feature-b');

    expect(herdr.focused).toBe('w2');
  });

  it('should create a missing session with a pane per worktree, without post-checkout, then switch to it', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    const { workspacePath } = await createWorkspace('feature-a', [repo1, repo2]);
    const tmux = fakeTmux();

    await run('feature-a');

    expect([...tmux.live]).toEqual(['feature-a']);
    expect(tmux.panes).toEqual([path.join(workspacePath, 'repo1'), path.join(workspacePath, 'repo2')]);
    expect(shell.execFile.getCalls().some((c: any) => c.args[1][0] === 'send-keys')).toBe(false);
    expect(tmux.switchedTo).toBe('feature-a');
    expect(logs().some((line) => line.includes('Created tmux session: ') && line.includes('feature-a'))).toBe(true);
  });

  it('should refuse outside tmux, with a hint to attach, and leave sessions alone', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');
    env.HERDR_ENV = '1';
    await createWorkspace('feature-a', [repo1]);
    const tmux = fakeTmux();

    await expect(run('feature-a')).rejects.toThrow("Not running inside tmux. Run this from inside tmux, or attach with: tmux attach -t 'feature-a'");
    expect([...tmux.live]).toEqual([]);
  });

  it('should refuse outside herdr before showing the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('herdr');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    await createWorkspace('feature-a', [repo1]);
    fakeHerdr([]);

    await expect(run()).rejects.toThrow('Not running inside herdr. Run this from inside herdr.');
    sinon.assert.notCalled(pickOneSpy);
  });

  it('should pick a workspace when no name is given, marking the active one', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    const a = await createWorkspace('feature/a', [repo1, repo2]);
    const b = await createWorkspace('other-b', [repo1]);
    (integration.services.process.cwd as sinon.SinonStub).returns(path.join(a.workspacePath, 'repo1'));
    const tmux = fakeTmux(['feature/a', 'other-b']);
    keys = ['oth', ENTER];

    await run();

    const { options } = pickOneSpy.firstCall.args[0];
    expect(options).toHaveLength(2);
    const strip = (label: string) => label.replace(/\x1b\[[0-9;]*m/g, '');
    expect(options.map((o) => ({ value: o.value, label: strip(o.label) }))).toEqual(
      expect.arrayContaining([
        { value: a.workspacePath, label: '* feature/a (2 repos)' },
        { value: b.workspacePath, label: '  other-b (1 repo)' },
      ])
    );
    expect(tmux.switchedTo).toBe('other-b');
  });

  it('should explain there is nothing to pick when there are no workspaces', async () => {
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    fakeTmux();

    await expect(run()).rejects.toThrow('No workspaces found.');
  });

  it('should switch nowhere when the picker is cancelled', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    await createWorkspace('feature-a', [repo1]);
    const tmux = fakeTmux(['feature-a']);
    keys = [ESC];

    await expect(run()).rejects.toThrow(PromptCancelledError);
    expect(tmux.switchedTo).toBeUndefined();
  });

  it('should fail for an unknown workspace', async () => {
    setup('tmux');
    env.TMUX = '/tmp/tmux-1000/default,1,0';
    const tmux = fakeTmux();

    await expect(run('nope')).rejects.toThrow(WorkspaceNotFoundError);
    expect(tmux.live.size).toBe(0);
  });

  describe('--servers', () => {
    const strip = (label: string) => label.replace(/\x1b\[[0-9;]*m/g, '');
    const pickedLabels = () => pickOneSpy.firstCall.args[0].options.map((o) => strip(o.label));

    it('should pick from the servers in workspaces and source repos, and switch to the chosen one\'s session', async () => {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      setup('tmux');
      env.TMUX = '/tmp/tmux-1000/default,1,0';
      const a = await createWorkspace('feature/a', [repo1]);
      const b = await createWorkspace('other-b', [repo1]);
      fakeLsof([
        { pid: 11, command: 'node', ports: [3000, 9229], cwd: path.join(a.workspacePath, 'repo1') },
        { pid: 12, command: 'postgres', ports: [5432], cwd: '/usr/local/var/postgres' },
        { pid: 13, command: 'vite', ports: [5173], cwd: path.join(b.workspacePath, 'repo1', 'web') },
        { pid: 14, command: 'rails', ports: [8080], cwd: repo1 },
      ]);
      const tmux = fakeTmux(['feature/a', 'other-b']);
      keys = ['vite', ENTER];

      await run(undefined, { servers: true });

      expect(pickedLabels()).toEqual([
        'feature/a  :3000 :9229  node   no pane',
        'other-b    :5173        vite   no pane',
        'repo1      :8080        rails  no pane',
      ]);
      expect(tmux.switchedTo).toBe('other-b');
    });

    it("should show the herdr pane each server runs in, and focus the chosen server's tab", async () => {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      setup('herdr');
      env.HERDR_ENV = '1';
      const a = await createWorkspace('feature/a', [repo1]);
      fakeLsof([
        // Started by npm run dev, so it shares npm's process group
        { pid: 701, pgid: 700, command: 'node', ports: [3000], cwd: path.join(a.workspacePath, 'repo1') },
        { pid: 801, command: 'rails', ports: [8080], cwd: repo1 },
      ]);
      const herdr = fakeHerdr(
        [
          { workspace_id: 'w1', label: 'feature/a' },
          { workspace_id: 'w2', label: 'repo1' },
        ],
        [
          { pane_id: 'w1:p1', tab_id: 'w1:t1', tab_label: 'root', cwd: a.workspacePath, pgid: 600, pids: [600] },
          { pane_id: 'w1:p3', tab_id: 'w1:t2', tab_label: 'repos', cwd: path.join(a.workspacePath, 'repo1'), pgid: 700, pids: [700, 701] },
          { pane_id: 'w2:p1', tab_id: 'w2:t1', tab_label: '1', cwd: repo1, pgid: 801, pids: [801] },
        ]
      );
      keys = ['rails', ENTER];

      await run(undefined, { servers: true });

      expect(pickedLabels()).toEqual([
        'feature/a  :3000  node   feature/a › repos',
        'repo1      :8080  rails  repo1 › 1',
      ]);
      expect(herdr.focusedTab).toBe('w2:t1');
      expect(logs()).toEqual([]);
    });

    it('should explain that a source repo server is not in any herdr pane, and switch nowhere', async () => {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      setup('herdr');
      env.HERDR_ENV = '1';
      fakeLsof([{ pid: 14, command: 'rails', ports: [8080], cwd: repo1 }]);
      const herdr = fakeHerdr([{ workspace_id: 'w1', label: 'feature-a' }]);
      keys = [ENTER];

      await run(undefined, { servers: true });

      expect(herdr.focusedTab).toBeUndefined();
      expect(herdr.focused).toBeUndefined();
      expect(logs().map(strip)).toEqual(["rails (:8080) runs in the source repo repo1, but isn't running in a herdr pane."]);
    });

    it('should switch to the session of a workspace server that is in no pane', async () => {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      setup('herdr');
      env.HERDR_ENV = '1';
      const a = await createWorkspace('feature-a', [repo1]);
      fakeLsof([{ pid: 11, command: 'node', ports: [3000], cwd: path.join(a.workspacePath, 'repo1') }]);
      const herdr = fakeHerdr([{ workspace_id: 'w1', label: 'feature-a' }]);
      keys = [ENTER];

      await run(undefined, { servers: true });

      expect(herdr.focused).toBe('w1');
    });

    it('should explain that a source repo server has no session, and switch nowhere', async () => {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      setup('tmux');
      env.TMUX = '/tmp/tmux-1000/default,1,0';
      fakeLsof([{ pid: 14, command: 'rails', ports: [8080], cwd: repo1 }]);
      const tmux = fakeTmux(['feature-a']);
      keys = [ENTER];

      await run(undefined, { servers: true });

      expect(tmux.switchedTo).toBeUndefined();
      expect(logs().map(strip)).toEqual(['rails (:8080) runs in the source repo repo1, but has no session to switch to.']);
    });

    it('should explain when no servers are running in workspaces or source repos', async () => {
      setup('tmux');
      env.TMUX = '/tmp/tmux-1000/default,1,0';
      fakeLsof([{ pid: 12, command: 'postgres', ports: [5432], cwd: '/usr/local/var/postgres' }]);
      fakeTmux();

      await expect(run(undefined, { servers: true })).rejects.toThrow('No servers are running in your workspaces or source repos.');
      sinon.assert.notCalled(pickOneSpy);
    });

    it('should refuse outside the session manager before looking for servers', async () => {
      setup('tmux');
      fakeLsof([]);
      fakeTmux();

      await expect(run(undefined, { servers: true })).rejects.toThrow('Not running inside tmux.');
      sinon.assert.notCalled(lsofShell.execFile);
    });

    it('should refuse a workspace name alongside --servers', async () => {
      setup('tmux');
      env.TMUX = '/tmp/tmux-1000/default,1,0';
      fakeLsof([]);
      fakeTmux();

      await expect(run('feature-a', { servers: true })).rejects.toThrow('Pass a workspace name or --servers, not both.');
    });
  });
});
