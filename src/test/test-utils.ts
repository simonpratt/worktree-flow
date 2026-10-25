import * as sinon from 'sinon';
import { Volume } from 'memfs';
import type { IFileSystem, IShell, IConsole, IProcess } from '../adapters/types.js';
import type { Services } from '../lib/services.js';
import type { SessionManager, SessionPane } from '../lib/sessionManager.js';

/**
 * Creates an in-memory filesystem using memfs
 */
export function createMemFs(files: Record<string, string> = {}) {
  const vol = Volume.fromJSON(files);
  return { vol, fs: vol as unknown as IFileSystem };
}

/**
 * Creates a mock shell using Sinon stubs
 */
export function createMockShell(): sinon.SinonStubbedInstance<IShell> {
  return {
    execFile: sinon.stub(),
    spawnDetached: sinon.stub(),
  };
}

/**
 * Creates a mock session manager (tmux/herdr) using Sinon stubs. By default no
 * sessions exist and every pane command succeeds.
 */
export function createMockSessionManager(label = 'tmux'): sinon.SinonStubbedInstance<SessionManager> {
  const succeedAll = async (_name: string, ...rest: any[]) => {
    const panes: SessionPane[] = rest[rest.length - 1];
    return panes.filter((p) => p.command).map((p) => ({ path: p.path, success: true }));
  };
  return {
    label,
    exists: sinon.stub().resolves(false),
    create: sinon.stub().callsFake(succeedAll),
    addPanes: sinon.stub().callsFake(succeedAll),
    close: sinon.stub().resolves(true),
    rename: sinon.stub().resolves(true),
    focus: sinon.stub().resolves(),
    isInside: sinon.stub().returns(true),
  } as any;
}

/**
 * Creates a mock console using Sinon stubs
 */
export function createMockConsole(): sinon.SinonStubbedInstance<IConsole> {
  return {
    log: sinon.stub(),
    error: sinon.stub(),
    write: sinon.stub(),
  };
}

/**
 * Creates a mock process using Sinon stubs
 */
export function createMockProcess(): sinon.SinonStubbedInstance<IProcess> {
  return {
    exit: sinon.stub() as any,
    cwd: sinon.stub(),
    env: sinon.stub().returns(undefined) as any,
  };
}

/**
 * Creates a fully-stubbed Services object for command-level testing
 */
export function createMockServices(): {
  [K in keyof Services]: sinon.SinonStubbedInstance<Services[K]>;
} {
  return {
    config: {
      loadRaw: sinon.stub(),
      saveRaw: sinon.stub(),
      set: sinon.stub(),
      load: sinon.stub().returns({
        copyFiles: '.env',
        sessionManager: 'none',
      }),
      getRequired: sinon.stub().returns({
        sourcePath: '/source',
        destPath: '/dest',
      }),
      getDisplayConfig: sinon.stub(),
    } as any,
    git: {
      fetch: sinon.stub(),
      remoteBranchExists: sinon.stub(),
      localRemoteBranchExists: sinon.stub(),
      addWorktreeNewBranch: sinon.stub(),
      addWorktree: sinon.stub(),
      pull: sinon.stub(),
      push: sinon.stub(),
      pushSetUpstream: sinon.stub(),
      getCurrentBranch: sinon.stub(),
      getUpstreamBranch: sinon.stub(),
      getStatusCounts: sinon.stub(),
      getUnpushedCommitCount: sinon.stub(),
      pruneWorktrees: sinon.stub(),
      pushWithRetry: sinon.stub(),
    } as any,
    repos: {
      discoverRepos: sinon.stub().returns([]),
      findReposWithBranch: sinon.stub(),
      formatRepoChoices: sinon.stub(),
    } as any,
    workspace: {
      createWorkspaceDir: sinon.stub(),
      copyAgentsMd: sinon.stub(),
      copyRootFiles: sinon.stub(),
      copyDevcontainer: sinon.stub(),
      copyConfigFilesToWorktree: sinon.stub(),
      detectWorkspace: sinon.stub(),
      getWorktreeDirs: sinon.stub().returns([]),
      runPostCheckoutCommand: sinon.stub(),
      listWorkspaces: sinon.stub(),
      createBranchWorktrees: sinon.stub(),
      createCheckoutWorktrees: sinon.stub(),
      findWorkspace: sinon.stub(),
      removeWorktrees: sinon.stub(),
    } as any,
    fetch: {
      fetchRepos: sinon.stub().resolves(),
    } as any,
    parallel: {
      processInParallel: sinon.stub(),
    } as any,
    status: {
      getWorktreeStatus: sinon.stub(),
      checkAllWorktrees: sinon.stub().resolves([]),
      findReposWithIssues: sinon.stub(),
    } as any,
    tmux: createMockSessionManager('tmux') as any,
    herdr: createMockSessionManager('herdr') as any,
    sessionManagers: { get: sinon.stub().returns(undefined) } as any,
    trash: {
      moveToTrash: sinon.stub(),
      deleteInBackground: sinon.stub(),
    } as any,
    console: createMockConsole() as any,
    process: createMockProcess() as any,
    repoConfig: {
      load: sinon.stub().returns(undefined),
      resolvePostCheckout: sinon.stub(),
      resolveCopyFiles: sinon.stub(),
    } as any,
  } as any;
}
