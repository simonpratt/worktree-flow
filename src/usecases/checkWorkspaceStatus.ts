import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { FetchService } from '../lib/fetch.js';
import type { StatusService, WorktreeStatus } from '../lib/status.js';

export type CheckWorkspaceStatusParams = {
  workspacePath: string;
  mainBranch: string;
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
    private fetch: FetchService,
    private status: StatusService
  ) {}

  async execute(params: CheckWorkspaceStatusParams): Promise<CheckWorkspaceStatusResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    await this.fetch.fetchRepos(worktreeDirs);

    const statuses = await this.status.checkAllWorktrees(
      worktreeDirs,
      params.mainBranch
    );

    return { statuses };
  }
}
