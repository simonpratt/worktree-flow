import * as sinon from 'sinon';
import { Volume } from 'memfs';
import type { IFileSystem, IShell, IConsole, IProcess } from '../adapters/types.js';
import type { Services } from '../lib/services.js';

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
  };
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
      load: sinon.stub().returns({
        copyFiles: '.env',
        tmux: false,
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
      removeWorktree: sinon.stub(),
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
      copyConfigFilesToWorktree: sinon.stub(),
      detectWorkspace: sinon.stub(),
      getWorktreeDirs: sinon.stub().returns([]),
      runPostCheckoutCommand: sinon.stub(),
      listWorkspaces: sinon.stub(),
      removeWorkspaceDir: sinon.stub(),
      createBranchWorktrees: sinon.stub(),
      createCheckoutWorktrees: sinon.stub(),
      createTmuxSession: sinon.stub(),
      killTmuxSession: sinon.stub(),
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
    tmux: {
      createSession: sinon.stub(),
      killSession: sinon.stub(),
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
