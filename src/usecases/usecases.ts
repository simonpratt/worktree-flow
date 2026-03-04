import type { Services } from '../lib/services.js';
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
import { CreateWorkspaceUseCase } from './createWorkspace.js';
import { CreateBranchUseCase } from './createBranch.js';
import { AddToWorkspaceUseCase } from './addToWorkspace.js';
import { DiscoverReposWithBranchUseCase } from './discoverReposWithBranch.js';

/**
 * Factory function for creating all use cases with their service dependencies.
 * Use cases orchestrate workflows by coordinating multiple services.
 */
export function createUseCases(services: Services) {
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
    removeWorkspace: new RemoveWorkspaceUseCase(
      services.workspaceDir,
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
      services.status
    ),
    discoverPrunableWorkspaces: new DiscoverPrunableWorkspacesUseCase(
      services.workspaceDir,
      services.status,
      services.git
    ),
    listWorkspacesWithStatus: new ListWorkspacesWithStatusUseCase(
      services.workspaceDir,
      services.status
    ),
    resumeTmuxSessions: new ResumeTmuxSessionsUseCase(
      services.workspaceDir,
      services.tmux
    ),
    createWorkspace: new CreateWorkspaceUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.tmux
    ),
    createBranch: new CreateBranchUseCase(services.git),
    addToWorkspace: new AddToWorkspaceUseCase(
      services.worktree,
      services.workspaceConfig,
      services.repoConfig,
      services.postCheckout,
      services.tmux
    ),
    discoverReposWithBranch: new DiscoverReposWithBranchUseCase(services.repos),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
