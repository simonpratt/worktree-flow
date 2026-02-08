import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { FetchService } from '../lib/fetch.js';
import type { StatusService, WorktreeStatus } from '../lib/status.js';
import { collectWorkspaceRepos } from '../lib/workspaceReposCollector.js';

export type ListWorkspacesWithStatusParams = {
  destPath: string;
  sourcePath: string;
  mainBranch: string;
  cwd: string;
};

export type WorkspaceWithStatus = {
  name: string;
  path: string;
  repoCount: number;
  isActive: boolean;
  statuses: Array<{ repoName: string; status: WorktreeStatus }>;
};

export type ListWorkspacesWithStatusResult = {
  workspaces: WorkspaceWithStatus[];
};

/**
 * Use case for listing all workspaces with their status information.
 * Fetches all repos and checks status for each workspace's worktrees.
 */
export class ListWorkspacesWithStatusUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private fetch: FetchService,
    private status: StatusService
  ) {}

  async execute(params: ListWorkspacesWithStatusParams): Promise<ListWorkspacesWithStatusResult> {
    const workspaces = this.workspaceDir.listWorkspaces(params.destPath);

    if (workspaces.length === 0) {
      return { workspaces: [] };
    }

    // Collect all worktree directories and unique source repos across all workspaces
    const { uniqueSourceRepos, workspaceWorktrees } = collectWorkspaceRepos(
      workspaces,
      this.workspaceDir,
      params.sourcePath
    );

    // Fetch all unique source repos once (silently to avoid UI jumping)
    if (uniqueSourceRepos.length > 0) {
      await this.fetch.fetchRepos(uniqueSourceRepos, { silent: true });
    }

    // Check status and detect active workspace
    const workspacesWithStatus: WorkspaceWithStatus[] = [];

    for (const workspace of workspaces) {
      const worktreeDirs = workspaceWorktrees.get(workspace.path);

      // Skip workspaces with no worktrees
      if (!worktreeDirs || worktreeDirs.length === 0) {
        continue;
      }

      // Check if this workspace is active (contains current working directory)
      const isActive = this.workspaceDir.detectWorkspace(params.cwd, params.destPath) === workspace.path;

      // Check status for all worktrees
      const statuses = await this.status.checkAllWorktrees(
        worktreeDirs,
        params.mainBranch
      );

      workspacesWithStatus.push({
        name: workspace.name,
        path: workspace.path,
        repoCount: workspace.repoCount,
        isActive,
        statuses,
      });
    }

    return { workspaces: workspacesWithStatus };
  }
}
