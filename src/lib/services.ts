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
  const repos = new RepoService(fs);
  const workspace = new WorkspaceService(fs, shell);
  const fetch = new FetchService(git, console);
  const parallel = new ParallelService(console);
  const status = new StatusService(git);
  const tmux = new TmuxService(shell);

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
