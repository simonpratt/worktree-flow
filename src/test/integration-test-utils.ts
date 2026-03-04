import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { NodeFileSystem, NodeShell, NodeConsole } from '../adapters/node.js';
import type { IConsole, IProcess } from '../adapters/types.js';
import { ConfigService } from '../lib/config.js';
import { GitService } from '../lib/git.js';
import { RepoService } from '../lib/repos.js';
import { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import { WorktreeService } from '../lib/worktree.js';
import { PostCheckoutService } from '../lib/postCheckout.js';
import { RepoConfigService } from '../lib/repoConfig.js';
import { FetchService } from '../lib/fetch.js';
import { ParallelService } from '../lib/parallel.js';
import { StatusService } from '../lib/status.js';
import { TmuxService } from '../lib/tmux.js';
import type { Services } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { UseCases } from '../usecases/usecases.js';

const shell = new NodeShell();

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await shell.execFile('git', args, { cwd });
  return stdout;
}

export function createTempDir(): { path: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-'));
  return {
    path: dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export async function initGitRepo(parentDir: string, name: string): Promise<string> {
  const repoPath = path.join(parentDir, name);
  fs.mkdirSync(repoPath, { recursive: true });
  await git(repoPath, ['init']);
  await git(repoPath, ['config', 'user.email', 'test@test.com']);
  await git(repoPath, ['config', 'user.name', 'Test']);
  // Create initial commit so HEAD exists
  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${name}\n`);
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-m', 'initial commit']);
  return repoPath;
}

export async function createRemoteBranchRef(repoPath: string, branchName: string): Promise<void> {
  // Create a local branch
  await git(repoPath, ['branch', branchName]);
  // Create a remote-tracking ref so localRemoteBranchExists() finds it
  const sha = (await git(repoPath, ['rev-parse', branchName])).trim();
  await git(repoPath, ['update-ref', `refs/remotes/origin/${branchName}`, sha]);
  // Keep the local branch — without a real remote configured, git worktree add
  // won't auto-create a local branch from origin/<branch> via DWIM
}

// Custom error to simulate process.exit() in tests
export class ProcessExitError extends Error {
  constructor(public code: number) {
    super(`Process exit with code ${code}`);
    this.name = 'ProcessExitError';
  }
}

export type IntegrationServices = {
  services: Services;
  useCases: UseCases;
  stubs: {
    console: sinon.SinonStubbedInstance<IConsole>;
    process: sinon.SinonStubbedInstance<IProcess>;
  };
};

export type CreateTestWorkspaceParams = {
  repos: string[];
  branchName: string;
  sourceBranch: string;
  sourcePath: string;
  destPath: string;
  copyFiles?: string;
  tmux: boolean;
};

export type CreateTestWorkspaceResult = {
  workspacePath: string;
};

/**
 * Test helper that creates a workspace with worktrees using the new use case pattern.
 * Replaces the removed createBranchWorkspace use case for test setup purposes.
 */
export async function createTestWorkspace(
  useCases: UseCases,
  params: CreateTestWorkspaceParams
): Promise<CreateTestWorkspaceResult> {
  const workspaceResult = await useCases.createWorkspace.execute({
    branchName: params.branchName,
    sourcePath: params.sourcePath,
    destPath: params.destPath,
    tmux: params.tmux,
  });

  const { workspacePath } = workspaceResult;

  await Promise.all(
    params.repos.map(async (repoPath) => {
      const branchResult = await useCases.createBranch.execute({
        repoPath,
        branchName: params.branchName,
        sourceBranch: params.sourceBranch,
      });

      await useCases.addToWorkspace.execute({
        repoPath,
        workspacePath,
        branchName: params.branchName,
        baseBranch: branchResult.baseBranch,
        sessionName: undefined,
        copyFiles: params.copyFiles,
        postCheckout: undefined,
      });

      // Seed origin/<branch> pointing at the current worktree HEAD so that
      // getUnpushedCommitCount() has a remote baseline and reports 0 for a
      // freshly created worktree with no additional commits.
      const { stdout: sha } = await shell.execFile('git', ['-C', repoPath, 'rev-parse', params.branchName]);
      await shell.execFile('git', ['-C', repoPath, 'update-ref', `refs/remotes/origin/${params.branchName}`, sha.trim()]);
    })
  );

  return { workspacePath };
}

export function createIntegrationServices(sourcePath: string, destPath: string): IntegrationServices {
  const nodeFs = new NodeFileSystem();
  const nodeShell = new NodeShell();

  const consoleStub: sinon.SinonStubbedInstance<IConsole> = {
    log: sinon.stub(),
    error: sinon.stub(),
    write: sinon.stub(),
  };

  const processStub: sinon.SinonStubbedInstance<IProcess> = {
    exit: sinon.stub().callsFake((code: number) => {
      throw new ProcessExitError(code);
    }) as any,
    cwd: sinon.stub().returns(process.cwd()) as any,
  };

  const gitService = new GitService(nodeShell);
  const parallel = new ParallelService(consoleStub);
  const status = new StatusService(gitService);
  const tmuxStub = {
    createSession: sinon.stub(),
    killSession: sinon.stub(),
    addPane: sinon.stub().resolves(1),
    sendKeysToPane: sinon.stub().resolves(),
  } as any;
  const repos = new RepoService(nodeFs, gitService);
  const postCheckout = new PostCheckoutService(nodeShell);
  const repoConfig = new RepoConfigService(nodeFs);

  // Focused workspace services
  const workspaceDir = new WorkspaceDirectoryService(nodeFs);
  const workspaceConfig = new WorkspaceConfigService(nodeFs);
  const worktree = new WorktreeService(nodeFs, gitService);

  // Stub fetch to be a no-op (no remote to fetch from)
  const fetch = { fetchRepos: sinon.stub().resolves() } as any;

  // Stub fetchCache with no usage history by default
  const fetchCache = {
    getRecentlyUsedRepos: sinon.stub().returns([]),
    trackBranchUsage: sinon.stub(),
    shouldFetch: sinon.stub().returns(true),
    markFetched: sinon.stub(),
    filterReposToFetch: sinon.stub().callsFake((repos: string[]) => repos),
  } as any;

  // Stub config to return hardcoded paths
  const config = {
    load: sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: undefined,
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
      branchRepoUsage: {},
    }),
    getRequired: sinon.stub().returns({ sourcePath, destPath }),
    loadRaw: sinon.stub(),
    saveRaw: sinon.stub(),
    getDisplayConfig: sinon.stub(),
  } as any;

  const services: Services = {
    config,
    git: gitService,
    repos,
    workspaceDir,
    workspaceConfig,
    worktree,
    postCheckout,
    repoConfig,
    fetch,
    fetchCache,
    parallel,
    status,
    tmux: tmuxStub,
    console: consoleStub,
    process: processStub,
  } as any;

  const useCases = createUseCases(services);

  return {
    services,
    useCases,
    stubs: {
      console: consoleStub,
      process: processStub,
    },
  };
}
