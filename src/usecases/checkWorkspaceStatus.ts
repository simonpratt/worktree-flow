import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { StatusService, WorktreeStatus } from '../lib/status.js';

export type CheckWorkspaceStatusParams = {
  workspacePath: string;
};

export type CheckWorkspaceStatusResult = {
  statuses: Array<{ repoName: string; status: WorktreeStatus }>;
};

/**
 * Use case for checking status of all worktrees in a workspace.
 */
export class CheckWorkspaceStatusUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private status: StatusService
  ) {}

  async execute(params: CheckWorkspaceStatusParams): Promise<CheckWorkspaceStatusResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    const statuses = await this.status.checkAllWorktrees(worktreeDirs);

    return { statuses };
  }
}
