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

  /** A fake herdr CLI with existing workspaces, tracking the one focused. */
  function fakeHerdr(workspaces: Array<{ workspace_id: string; label: string }>) {
    const state = { focused: undefined as string | undefined };
    const ok = (result: any) => ({ stdout: JSON.stringify({ id: 'cli', result }), stderr: '' });
    shell.execFile.callsFake(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('herdr');
      if (args[0] === 'workspace' && args[1] === 'list') return ok({ type: 'workspace_list', workspaces });
      if (args[0] === 'workspace' && args[1] === 'focus') {
        state.focused = args[2];
        return ok({ type: 'workspace_info', workspace: workspaces.find((w) => w.workspace_id === args[2]) });
      }
      throw new Error(`unexpected herdr call: ${args.join(' ')}`);
    });
    return state;
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

  const run = (name?: string) => runSwitch(name, integration.useCases, integration.services, { pickOne: pickOneSpy });

  const logs = () => (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0] as string);

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    shell = createMockShell();
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
});
