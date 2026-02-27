import type { Services } from '../lib/services.js';
import { CreateBranchWorkspaceUseCase } from './createBranchWorkspace.js';
import { CheckoutWorkspaceUseCase } from './checkoutWorkspace.js';
import { RemoveWorkspaceUseCase } from './removeWorkspace.js';
import { PushWorkspaceUseCase } from './pushWorkspace.js';
import { PullWorkspaceUseCase } from './pullWorkspace.js';
import { CheckWorkspaceStatusUseCase } from './checkWorkspaceStatus.js';
import { DiscoverPrunableWorkspacesUseCase } from './discoverPrunableWorkspaces.js';
import { ListWorkspacesWithStatusUseCase } from './listWorkspacesWithStatus.js';
import { FetchAllReposUseCase } from './fetchAllRepos.js';
import { FetchWorkspaceReposUseCase } from './fetchWorkspaceRepos.js';
import { FetchUsedReposUseCase } from './fetchUsedRepos.js';
import { ResumeTmuxSessionsUseCase } from './resumeTmuxSessions.js';
import { RunPostCheckoutUseCase } from './runPostCheckout.js';
import { AddReposToWorkspaceUseCase } from './addReposToWorkspace.js';

/**
 * Factory function for creating all use cases with their service dependencies.
 * Use cases orchestrate workflows by coordinating multiple services.
 */
export function createUseCases(services: Services) {
  // Create use cases that are dependencies first
  const runPostCheckout = new RunPostCheckoutUseCase(
    services.workspaceDir,
    services.postCheckout,
    services.tmux
  );

  const addReposToWorkspace = new AddReposToWorkspaceUseCase(
    services.workspaceConfig,
    services.worktree,
    services.git,
    services.parallel,
    runPostCheckout
  );

  return {
    fetchAllRepos: new FetchAllReposUseCase(services.fetch, services.repos),
    fetchWorkspaceRepos: new FetchWorkspaceReposUseCase(
      services.workspaceDir,
      services.fetch
    ),
    fetchUsedRepos: new FetchUsedReposUseCase(
      services.workspaceDir,
      services.fetch
    ),
    addReposToWorkspace,
    createBranchWorkspace: new CreateBranchWorkspaceUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.tmux,
      addReposToWorkspace
    ),
    checkoutWorkspace: new CheckoutWorkspaceUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.worktree,
      services.repos,
      services.git,
      services.parallel,
      services.tmux,
      runPostCheckout
    ),
    removeWorkspace: new RemoveWorkspaceUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.worktree,
      services.repos,
      services.status,
      services.tmux
    ),
    pushWorkspace: new PushWorkspaceUseCase(
      services.workspaceDir,
      services.git,
      services.parallel
    ),
    pullWorkspace: new PullWorkspaceUseCase(
      services.workspaceDir,
      services.git,
      services.parallel
    ),
    checkWorkspaceStatus: new CheckWorkspaceStatusUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.status
    ),
    discoverPrunableWorkspaces: new DiscoverPrunableWorkspacesUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.status,
      services.git
    ),
    listWorkspacesWithStatus: new ListWorkspacesWithStatusUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.status
    ),
    resumeTmuxSessions: new ResumeTmuxSessionsUseCase(
      services.workspaceDir,
      services.tmux
    ),
    runPostCheckout,
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
