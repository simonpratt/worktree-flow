import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { FetchService } from '../lib/fetch.js';

export type FetchWorkspaceReposParams = {
  workspacePath: string;
  sourcePath: string;
  fetchCacheTtlSeconds: number;
  silent?: boolean;
};

/**
 * Use case for fetching all source repos needed by a single workspace.
 * Discovers worktrees in the workspace and fetches their corresponding source repos.
 * Used by commands operating on a specific workspace (remove, status).
 */
export class FetchWorkspaceReposUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private fetch: FetchService
  ) {}

  async execute(params: FetchWorkspaceReposParams): Promise<void> {
    // Get all worktree directories in the workspace
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    // Map worktree directories to source repo paths
    const sourceRepos = worktreeDirs.map((worktreePath) => {
      const repoName = path.basename(worktreePath);
      return path.join(params.sourcePath, repoName);
    });

    // Deduplicate repos (defensive - shouldn't have duplicates but be safe)
    const uniqueSourceRepos = Array.from(new Set(sourceRepos));

    // Fetch source repos
    await this.fetch.fetchRepos(uniqueSourceRepos, {
      silent: params.silent ?? false,
      ttlSeconds: params.fetchCacheTtlSeconds,
    });
  }
}
