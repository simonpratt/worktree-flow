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
import { ListWorkspaceSessionsUseCase } from './listWorkspaceSessions.js';
import { OpenSessionsUseCase } from './openSessions.js';
import { OpenWorkspaceSessionUseCase } from './openWorkspaceSession.js';
import { SwitchToWorkspaceUseCase } from './switchToWorkspace.js';
import { ListWorkspaceServersUseCase } from './listWorkspaceServers.js';
import { CreateWorkspaceUseCase } from './createWorkspace.js';
import { CreateBranchUseCase } from './createBranch.js';
import { AddToWorkspaceUseCase } from './addToWorkspace.js';
import { DiscoverReposWithBranchUseCase } from './discoverReposWithBranch.js';
import { RenameWorkspaceFolderUseCase } from './renameWorkspaceFolder.js';
import { RenameWorkspaceBranchesUseCase } from './renameWorkspaceBranches.js';
import { RenameSessionUseCase } from './renameSession.js';
import { OfferHerdrIntegrationUseCase } from './offerHerdrIntegration.js';

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
      services.sessionManagers,
      services.trash
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
    listWorkspaceSessions: new ListWorkspaceSessionsUseCase(
      services.workspaceDir,
      services.workspaceConfig
    ),
    openSessions: new OpenSessionsUseCase(services.workspaceDir),
    switchToWorkspace: new SwitchToWorkspaceUseCase(services.workspaceDir),
    listWorkspaceServers: new ListWorkspaceServersUseCase(
      services.servers,
      services.workspaceDir,
      services.workspaceConfig
    ),
    openWorkspaceSession: new OpenWorkspaceSessionUseCase(
      services.workspaceDir,
      services.postCheckout,
      services.sessionManagers
    ),
    createWorkspace: new CreateWorkspaceUseCase(
      services.workspaceDir,
      services.workspaceConfig
    ),
    createBranch: new CreateBranchUseCase(services.git),
    addToWorkspace: new AddToWorkspaceUseCase(
      services.worktree,
      services.workspaceConfig,
      services.repoConfig
    ),
    discoverReposWithBranch: new DiscoverReposWithBranchUseCase(services.repos),
    renameWorkspaceFolder: new RenameWorkspaceFolderUseCase(
      services.workspaceDir,
      services.git,
      services.repos
    ),
    renameWorkspaceBranches: new RenameWorkspaceBranchesUseCase(
      services.workspaceDir,
      services.workspaceConfig,
      services.git,
      services.repos
    ),
    renameSession: new RenameSessionUseCase(services.sessionManagers),
    offerHerdrIntegration: new OfferHerdrIntegrationUseCase(services.config, services.herdr),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
