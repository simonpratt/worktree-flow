import type { Services } from '../lib/services.js';
import { CreateBranchWorkspaceUseCase } from './createBranchWorkspace.js';
import { CheckoutWorkspaceUseCase } from './checkoutWorkspace.js';
import { RemoveWorkspaceUseCase } from './removeWorkspace.js';
import { PushWorkspaceUseCase } from './pushWorkspace.js';
import { PullWorkspaceUseCase } from './pullWorkspace.js';
import { CheckWorkspaceStatusUseCase } from './checkWorkspaceStatus.js';

/**
 * Factory function for creating all use cases with their service dependencies.
 * Use cases orchestrate workflows by coordinating multiple services.
 */
export function createUseCases(services: Services) {
  return {
    createBranchWorkspace: new CreateBranchWorkspaceUseCase(
      services.workspaceDir,
      services.worktree,
      services.repos,
      services.fetch,
      services.parallel,
      services.tmux,
      services.postCheckout
    ),
    checkoutWorkspace: new CheckoutWorkspaceUseCase(
      services.workspaceDir,
      services.worktree,
      services.repos,
      services.fetch,
      services.parallel,
      services.tmux,
      services.postCheckout
    ),
    removeWorkspace: new RemoveWorkspaceUseCase(
      services.workspaceDir,
      services.worktree,
      services.repos,
      services.fetch,
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
      services.fetch,
      services.status
    ),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
