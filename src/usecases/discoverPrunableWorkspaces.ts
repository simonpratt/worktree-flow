import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { FetchService } from '../lib/fetch.js';
import type { StatusService, WorktreeStatus } from '../lib/status.js';
import type { GitService } from '../lib/git.js';
import { StatusService as StatusServiceClass } from '../lib/status.js';

export type DiscoverPrunableWorkspacesParams = {
  destPath: string;
  sourcePath: string;
  mainBranch: string;
  daysOld: number;
};

export type PrunableWorkspace = {
  name: string;
  path: string;
  repoCount: number;
  oldestCommitDate: Date;
  statuses: Array<{ repoName: string; status: WorktreeStatus }>;
};

export type DiscoverPrunableWorkspacesResult = {
  prunable: PrunableWorkspace[];
};

/**
 * Use case for analyzing workspaces to find candidates for pruning.
 * Returns workspaces where all worktrees have no issues and commits are older than specified days.
 */
export class DiscoverPrunableWorkspacesUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private fetch: FetchService,
    private status: StatusService,
    private git: GitService
  ) {}

  async execute(params: DiscoverPrunableWorkspacesParams): Promise<DiscoverPrunableWorkspacesResult> {
    const workspaces = this.workspaceDir.listWorkspaces(params.destPath);
    const prunable: PrunableWorkspace[] = [];
    const cutoffDate = new Date(Date.now() - params.daysOld * 24 * 60 * 60 * 1000);

    // Collect all worktree directories and unique source repos across all workspaces
    const uniqueSourceRepos = new Set<string>();
    const workspaceWorktrees = new Map<string, string[]>();

    for (const workspace of workspaces) {
      const worktreeDirs = this.workspaceDir.getWorktreeDirs(workspace.path);
      if (worktreeDirs.length > 0) {
        workspaceWorktrees.set(workspace.path, worktreeDirs);
        // Extract repo names and build source repo paths
        worktreeDirs.forEach((worktreePath) => {
          const repoName = path.basename(worktreePath);
          const sourceRepoPath = path.join(params.sourcePath, repoName);
          uniqueSourceRepos.add(sourceRepoPath);
        });
      }
    }

    // Fetch all unique source repos once
    // Since worktrees share the same git repository, fetching in one worktree
    // updates the remote refs for all worktrees of that repository
    if (uniqueSourceRepos.size > 0) {
      await this.fetch.fetchRepos(Array.from(uniqueSourceRepos));
    }

    // Now analyze each workspace
    for (const workspace of workspaces) {
      const worktreeDirs = workspaceWorktrees.get(workspace.path);

      // Skip workspaces with no worktrees
      if (!worktreeDirs || worktreeDirs.length === 0) {
        continue;
      }

      // Check status for all worktrees
      const statuses = await this.status.checkAllWorktrees(
        worktreeDirs,
        params.mainBranch
      );

      // Skip if any worktree has issues
      const hasAnyIssues = statuses.some(({ status }) =>
        StatusServiceClass.hasIssues(status)
      );

      if (hasAnyIssues) {
        continue;
      }

      // Get last commit dates for all worktrees
      const commitDates = await Promise.all(
        worktreeDirs.map((worktreePath) => this.git.getLastCommitDate(worktreePath))
      );

      // Find the most recent commit
      const oldestCommitDate = commitDates.reduce((oldest, current) =>
        current > oldest ? current : oldest
      );

      // Skip if any commit is too recent
      if (oldestCommitDate > cutoffDate) {
        continue;
      }

      // This workspace is prunable
      prunable.push({
        name: workspace.name,
        path: workspace.path,
        repoCount: workspace.repoCount,
        oldestCommitDate,
        statuses,
      });
    }

    return { prunable };
  }
}
