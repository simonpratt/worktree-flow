/**
 * Service factory for creating all services with production adapters.
 */

import { NodeFileSystem, NodeShell, NodeConsole, NodeProcess } from '../adapters/node.js';
import { ConfigService } from './config.js';
import { GitService } from './git.js';
import { RepoService } from './repos.js';
import { WorkspaceDirectoryService } from './workspaceDirectory.js';
import { WorkspaceConfigService } from './workspaceConfig.js';
import { WorktreeService } from './worktree.js';
import { PostCheckoutService } from './postCheckout.js';
import { FetchService } from './fetch.js';
import { FetchCacheService } from './fetchCache.js';
import { ParallelService } from './parallel.js';
import { StatusService } from './status.js';
import { TmuxService } from './tmux.js';

export function createServices() {
  // Create adapters
  const fs = new NodeFileSystem();
  const shell = new NodeShell();
  const console = new NodeConsole();
  const process = new NodeProcess();

  // Create services (no service-to-service dependencies)
  const config = new ConfigService(fs);
  const git = new GitService(shell);
  const parallel = new ParallelService(console);
  const status = new StatusService(git);
  const tmux = new TmuxService(shell);
  const fetchCache = new FetchCacheService(fs);
  const fetch = new FetchService(git, console, fetchCache);
  const repos = new RepoService(fs, git);
  const postCheckout = new PostCheckoutService(shell);

  // Focused workspace services
  const workspaceDir = new WorkspaceDirectoryService(fs);
  const workspaceConfig = new WorkspaceConfigService(fs);
  const worktree = new WorktreeService(fs, git);

  return {
    config,
    git,
    repos,
    workspaceDir,
    workspaceConfig,
    worktree,
    postCheckout,
    fetch,
    fetchCache,
    parallel,
    status,
    tmux,
    console,
    process,
  };
}

export type Services = ReturnType<typeof createServices>;
