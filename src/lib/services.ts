/**
 * Service factory for creating all services with production adapters.
 */

import { NodeFileSystem, NodeShell, NodeConsole, NodeProcess } from '../adapters/node.js';
import { ConfigService } from './config.js';
import { GitService } from './git.js';
import { RepoService } from './repos.js';
import { WorkspaceService } from './workspace.js';
import { FetchService } from './fetch.js';
import { ParallelService } from './parallel.js';
import { StatusService } from './status.js';
import { TmuxService } from './tmux.js';

export function createServices() {
  // Create adapters
  const fs = new NodeFileSystem();
  const shell = new NodeShell();
  const console = new NodeConsole();
  const process = new NodeProcess();

  // Create services
  const config = new ConfigService(fs);
  const git = new GitService(shell);
  const parallel = new ParallelService(console);
  const status = new StatusService(git);
  const tmux = new TmuxService(shell);

  // Create repos with git dependency
  const repos = new RepoService(fs, git);

  // Create workspace with dependencies for orchestration
  const workspace = new WorkspaceService(fs, shell, git, parallel, tmux, repos);

  const fetch = new FetchService(git, console);

  return {
    config,
    git,
    repos,
    workspace,
    fetch,
    parallel,
    status,
    tmux,
    console,
    process,
  };
}

export type Services = ReturnType<typeof createServices>;
