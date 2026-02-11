import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
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
    private workspaceConfig: WorkspaceConfigService,
    private status: StatusService
  ) {}

  async execute(params: CheckWorkspaceStatusParams): Promise<CheckWorkspaceStatusResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    // Load workspace config to get per-repo base branches
    const config = this.workspaceConfig.load(params.workspacePath);
    const getBaseBranch = (repoName: string) =>
      config.baseBranches[repoName] || 'master';

    const statuses = await this.status.checkAllWorktrees(
      worktreeDirs,
      getBaseBranch
    );

    return { statuses };
  }
}
