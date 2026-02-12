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
  // Create origin/master ref so isAheadOfMain() can compare against it
  const sha = (await git(repoPath, ['rev-parse', 'HEAD'])).trim();
  await git(repoPath, ['update-ref', 'refs/remotes/origin/master', sha]);
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
  const tmuxStub = { createSession: sinon.stub(), killSession: sinon.stub() } as any;
  const repos = new RepoService(nodeFs, gitService);
  const postCheckout = new PostCheckoutService(nodeShell);

  // Focused workspace services
  const workspaceDir = new WorkspaceDirectoryService(nodeFs);
  const workspaceConfig = new WorkspaceConfigService(nodeFs);
  const worktree = new WorktreeService(nodeFs, gitService);

  // Stub fetch to be a no-op (no remote to fetch from)
  const fetch = { fetchRepos: sinon.stub().resolves() } as any;

  // Stub config to return hardcoded paths
  const config = {
    load: sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
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
    fetch,
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
