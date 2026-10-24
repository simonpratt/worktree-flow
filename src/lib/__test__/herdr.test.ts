import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { HerdrService } from '../herdr.js';
import { SessionExistsError } from '../sessionManager.js';
import { createMockShell } from '../../test/test-utils.js';

type FakePane = { pane_id: string; tab_id: string; cwd: string };

/**
 * A fake herdr CLI over the mock shell, returning the JSON shapes the real CLI
 * prints. Errors are printed to stderr with a non-zero exit, as herdr does.
 */
function fakeHerdr(shell: sinon.SinonStubbedInstance<any>) {
  const state = {
    running: true,
    workspaces: [] as Array<{ workspace_id: string; label: string }>,
    tabs: [] as Array<{ tab_id: string; workspace_id: string; label: string }>,
    panes: [] as FakePane[],
    /** Canned `pane layout` rects, keyed by pane id */
    rects: {} as Record<string, { width: number; height: number }>,
    runs: [] as Array<{ pane: string; command: string }>,
    failRunFor: new Set<string>(),
  };
  let nextWorkspace = 0;
  const nextIndex: Record<string, { tab: number; pane: number }> = {};

  const fail = (code: string, message: string) => {
    const error: any = new Error(`Command failed: herdr`);
    error.stdout = '';
    error.stderr = JSON.stringify({ id: 'cli', error: { code, message } });
    throw error;
  };
  const ok = (result: any) => ({ stdout: JSON.stringify({ id: 'cli', result }), stderr: '' });
  const opt = (args: string[], name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const addPane = (workspaceId: string, tabId: string, cwd: string): FakePane => {
    const pane = { pane_id: `${workspaceId}:p${++nextIndex[workspaceId].pane}`, tab_id: tabId, cwd };
    state.panes.push(pane);
    return pane;
  };
  const addTab = (workspaceId: string, label: string) => {
    const tab = { tab_id: `${workspaceId}:t${++nextIndex[workspaceId].tab}`, workspace_id: workspaceId, label };
    state.tabs.push(tab);
    return tab;
  };

  shell.execFile.callsFake(async (cmd: string, args: string[]) => {
    expect(cmd).toBe('herdr');
    if (!state.running) fail('server_not_running', 'no herdr server is running');
    const [group, action, ...rest] = args;

    if (group === 'workspace' && action === 'list') {
      return ok({ type: 'workspace_list', workspaces: state.workspaces });
    }
    if (group === 'workspace' && action === 'create') {
      const workspace_id = `w${++nextWorkspace}`;
      nextIndex[workspace_id] = { tab: 0, pane: 0 };
      const workspace = { workspace_id, label: opt(args, '--label')! };
      state.workspaces.push(workspace);
      const tab = addTab(workspace_id, '1');
      const root_pane = addPane(workspace_id, tab.tab_id, opt(args, '--cwd')!);
      return ok({ type: 'workspace_created', workspace, tab, root_pane });
    }
    if (group === 'workspace' && (action === 'close' || action === 'rename')) {
      const workspace = state.workspaces.find((w) => w.workspace_id === rest[0]);
      if (!workspace) fail('workspace_not_found', `workspace ${rest[0]} not found`);
      if (action === 'close') state.workspaces = state.workspaces.filter((w) => w !== workspace);
      else workspace!.label = rest[1];
      return ok({ type: 'workspace_info', workspace });
    }
    if (group === 'tab' && action === 'rename') {
      const tab = state.tabs.find((t) => t.tab_id === rest[0])!;
      tab.label = rest[1];
      return ok({ type: 'tab_info', tab });
    }
    if (group === 'tab' && action === 'create') {
      const workspaceId = opt(args, '--workspace')!;
      const tab = addTab(workspaceId, opt(args, '--label')!);
      const root_pane = addPane(workspaceId, tab.tab_id, opt(args, '--cwd')!);
      return ok({ type: 'tab_created', tab, root_pane });
    }
    if (group === 'tab' && action === 'list') {
      const workspaceId = opt(args, '--workspace');
      return ok({ type: 'tab_list', tabs: state.tabs.filter((t) => t.workspace_id === workspaceId) });
    }
    if (group === 'pane' && action === 'split') {
      const target = state.panes.find((p) => p.pane_id === rest[0])!;
      const pane = addPane(target.pane_id.split(':')[0], target.tab_id, opt(args, '--cwd')!);
      return ok({ type: 'pane_info', pane });
    }
    if (group === 'pane' && action === 'list') {
      const workspaceId = opt(args, '--workspace');
      return ok({ type: 'pane_list', panes: state.panes.filter((p) => p.pane_id.startsWith(`${workspaceId}:`)) });
    }
    if (group === 'pane' && action === 'layout') {
      const tabId = state.panes.find((p) => p.pane_id === opt(args, '--pane'))!.tab_id;
      const panes = state.panes
        .filter((p) => p.tab_id === tabId)
        .map((p) => ({ pane_id: p.pane_id, rect: state.rects[p.pane_id] ?? { width: 10, height: 10 } }));
      return ok({ type: 'pane_layout', layout: { tab_id: tabId, panes } });
    }
    if (group === 'pane' && action === 'run') {
      if (state.failRunFor.has(rest[0])) fail('pane_not_found', 'pane not found');
      state.runs.push({ pane: rest[0], command: rest[1] });
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unexpected herdr call: ${args.join(' ')}`);
  });

  const splits = () =>
    shell.execFile
      .getCalls()
      .map((c: any) => c.args[1] as string[])
      .filter((a: string[]) => a[0] === 'pane' && a[1] === 'split')
      .map((a: string[]) => ({ pane: a[2], direction: opt(a, '--direction'), ratio: opt(a, '--ratio'), cwd: opt(a, '--cwd') }));

  return { state, splits };
}

describe('HerdrService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let sleep: sinon.SinonStub;
  let service: HerdrService;
  let herdr: ReturnType<typeof fakeHerdr>;

  beforeEach(() => {
    shell = createMockShell();
    sleep = sinon.stub().resolves();
    service = new HerdrService(shell as any, sleep);
    herdr = fakeHerdr(shell);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('create', () => {
    it('should create a workspace labelled with the session name, with a root tab split in half at the root', async () => {
      await service.create('feat/x', '/ws', []);

      expect(herdr.state.workspaces).toEqual([{ workspace_id: 'w1', label: 'feat/x' }]);
      expect(herdr.state.tabs).toEqual([{ tab_id: 'w1:t1', workspace_id: 'w1', label: 'root' }]);
      expect(herdr.state.panes.map((p) => [p.tab_id, p.cwd])).toEqual([
        ['w1:t1', '/ws'],
        ['w1:t1', '/ws'],
      ]);
      expect(herdr.splits()).toEqual([{ pane: 'w1:p1', direction: 'right', ratio: undefined, cwd: '/ws' }]);
    });

    it('should never take focus', async () => {
      await service.create('feat/x', '/ws', [{ path: '/ws/a' }, { path: '/ws/b' }]);

      const creating = shell.execFile
        .getCalls()
        .map((c: any) => c.args[1] as string[])
        .filter((a: string[]) => a[1] === 'create' || a[1] === 'split');
      expect(creating.length).toBeGreaterThan(0);
      for (const args of creating) {
        expect(args).toContain('--no-focus');
      }
    });

    it('should put a terminal per worktree in a repos tab', async () => {
      await service.create('feat/x', '/ws', [{ path: '/ws/a' }, { path: '/ws/b' }]);

      expect(herdr.state.tabs.map((t) => t.label)).toEqual(['root', 'repos']);
      const reposPanes = herdr.state.panes.filter((p) => p.tab_id === 'w1:t2').map((p) => p.cwd);
      expect(reposPanes).toEqual(['/ws/a', '/ws/b']);
    });

    it('should lay out the repos tab as an even grid', async () => {
      // 5 panes → 3 columns x 2 rows: [a b c] / [d e]
      await service.create('feat/x', '/ws', ['a', 'b', 'c', 'd', 'e'].map((r) => ({ path: `/ws/${r}` })));

      const reposSplits = herdr.splits().slice(1);
      expect(reposSplits).toEqual([
        // Rows first: the first row keeps half the tab
        { pane: 'w1:p3', direction: 'down', ratio: '0.5000', cwd: '/ws/d' },
        // First row: each split keeps 1/remaining so columns are equal
        { pane: 'w1:p3', direction: 'right', ratio: '0.3333', cwd: '/ws/b' },
        { pane: 'w1:p5', direction: 'right', ratio: '0.5000', cwd: '/ws/c' },
        // Second row
        { pane: 'w1:p4', direction: 'right', ratio: '0.5000', cwd: '/ws/e' },
      ]);
    });

    it('should run each command in its own pane once all panes exist', async () => {
      const results = await service.create('feat/x', '/ws', [
        { path: '/ws/a', command: 'npm ci' },
        { path: '/ws/b' },
        { path: '/ws/c', command: 'make' },
      ]);

      const paneFor = (cwd: string) => herdr.state.panes.find((p) => p.tab_id === 'w1:t2' && p.cwd === cwd)!.pane_id;
      expect(herdr.state.runs).toEqual([
        { pane: paneFor('/ws/a'), command: 'npm ci' },
        { pane: paneFor('/ws/c'), command: 'make' },
      ]);
      expect(results).toEqual([
        { path: '/ws/a', success: true },
        { path: '/ws/c', success: true },
      ]);

      const actions = shell.execFile.getCalls().map((c: any) => (c.args[1] as string[]).slice(0, 2).join(' '));
      expect(actions.indexOf('pane run')).toBeGreaterThan(actions.lastIndexOf('pane split'));
    });

    it('should report a command that fails to run without failing the others', async () => {
      // The repos tab's panes are w1:p3 (a) and w1:p4 (b)
      herdr.state.failRunFor.add('w1:p3');

      const results = await service.create('feat/x', '/ws', [
        { path: '/ws/a', command: 'npm ci' },
        { path: '/ws/b', command: 'make' },
      ]);

      expect(results).toEqual([
        { path: '/ws/a', success: false },
        { path: '/ws/b', success: true },
      ]);
    });

    it('should throw SessionExistsError when a workspace with the label already exists', async () => {
      await service.create('feat/x', '/ws', []);

      await expect(service.create('feat/x', '/ws', [{ path: '/ws/a', command: 'npm ci' }])).rejects.toBeInstanceOf(
        SessionExistsError
      );
      expect(herdr.state.workspaces).toHaveLength(1);
      expect(herdr.state.runs).toEqual([]);
    });

    it('should start a headless server when none is running, then create the workspace', async () => {
      herdr.state.running = false;
      shell.spawnDetached.callsFake(() => {
        herdr.state.running = true;
      });

      await service.create('feat/x', '/ws', []);

      sinon.assert.calledOnceWithExactly(shell.spawnDetached, 'herdr', ['server']);
      expect(herdr.state.workspaces).toHaveLength(1);
    });

    it('should give up when the server never starts', async () => {
      herdr.state.running = false;

      await expect(service.create('feat/x', '/ws', [])).rejects.toThrow('Timed out waiting for the herdr server');
    });
  });

  describe('addPanes', () => {
    it('should split the largest pane in the repos tab, along its longer side', async () => {
      await service.create('feat/x', '/ws', [{ path: '/ws/a' }, { path: '/ws/b' }]);
      // a is wide (cells are ~2x taller than wide, so 60x20 is wide), b is narrower
      herdr.state.rects = { 'w1:p3': { width: 60, height: 20 }, 'w1:p4': { width: 30, height: 20 } };

      const results = await service.addPanes('feat/x', [{ path: '/ws/c', command: 'npm ci' }]);

      expect(herdr.splits().at(-1)).toEqual({ pane: 'w1:p3', direction: 'right', ratio: undefined, cwd: '/ws/c' });
      expect(herdr.state.runs).toEqual([{ pane: 'w1:p5', command: 'npm ci' }]);
      expect(results).toEqual([{ path: '/ws/c', success: true }]);
    });

    it('should split downwards when the largest pane is tall', async () => {
      await service.create('feat/x', '/ws', [{ path: '/ws/a' }]);
      herdr.state.rects = { 'w1:p3': { width: 40, height: 40 } };

      await service.addPanes('feat/x', [{ path: '/ws/b' }]);

      expect(herdr.splits().at(-1)).toMatchObject({ pane: 'w1:p3', direction: 'down' });
    });

    it('should create the repos tab when the workspace has none yet', async () => {
      await service.create('feat/x', '/ws', []);

      await service.addPanes('feat/x', [{ path: '/ws/a' }]);

      expect(herdr.state.tabs.map((t) => t.label)).toEqual(['root', 'repos']);
      expect(herdr.state.panes.at(-1)).toMatchObject({ tab_id: 'w1:t2', cwd: '/ws/a' });
    });

    it('should throw when the workspace does not exist', async () => {
      await expect(service.addPanes('feat/x', [{ path: '/ws/a' }])).rejects.toThrow('herdr workspace not found');
    });
  });

  describe('exists', () => {
    it('should find the workspace by label', async () => {
      await service.create('feat/x', '/ws', []);

      await expect(service.exists('feat/x')).resolves.toBe(true);
      await expect(service.exists('feat/y')).resolves.toBe(false);
    });

    it('should report no session, without starting a server, when none is running', async () => {
      herdr.state.running = false;

      await expect(service.exists('feat/x')).resolves.toBe(false);
      sinon.assert.notCalled(shell.spawnDetached);
    });
  });

  describe('close', () => {
    it('should close the workspace with the label', async () => {
      await service.create('feat/x', '/ws', []);

      await expect(service.close('feat/x')).resolves.toBe(true);
      expect(herdr.state.workspaces).toEqual([]);
    });

    it('should report nothing was closed when there is no such workspace', async () => {
      await expect(service.close('feat/x')).resolves.toBe(false);
    });

    it('should report nothing was closed when no server is running', async () => {
      herdr.state.running = false;

      await expect(service.close('feat/x')).resolves.toBe(false);
    });
  });

  describe('rename', () => {
    it('should relabel the workspace', async () => {
      await service.create('feat/x', '/ws', []);

      await expect(service.rename('feat/x', 'feat/y')).resolves.toBe(true);
      expect(herdr.state.workspaces.map((w) => w.label)).toEqual(['feat/y']);
    });

    it('should not rename when there is no such workspace', async () => {
      await expect(service.rename('feat/x', 'feat/y')).resolves.toBe(false);
    });
  });

  describe('isInstalled', () => {
    it('should report herdr as installed when it is on the PATH', async () => {
      shell.execFile.withArgs('which', ['herdr']).resolves({ stdout: '/usr/local/bin/herdr\n', stderr: '' });

      await expect(service.isInstalled()).resolves.toBe(true);
    });

    it('should report herdr as not installed when it is not on the PATH', async () => {
      shell.execFile.withArgs('which', ['herdr']).rejects(new Error('exit 1'));

      await expect(service.isInstalled()).resolves.toBe(false);
    });
  });
});
