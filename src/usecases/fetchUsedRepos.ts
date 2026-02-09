import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { FetchService } from '../lib/fetch.js';
import { collectWorkspaceRepos } from '../lib/workspaceReposCollector.js';

export type FetchUsedReposParams = {
  destPath: string;
  sourcePath: string;
  fetchCacheTtlSeconds: number;
  silent?: boolean;
};

/**
 * Use case for fetching all source repos used across all workspaces.
 * This discovers all workspaces, collects their repos, and fetches them.
 * Used by commands that need to analyze all workspaces (prune, list).
 */
export class FetchUsedReposUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private fetch: FetchService
  ) {}

  async execute(params: FetchUsedReposParams): Promise<void> {
    // Discover all workspaces
    const workspaces = this.workspaceDir.listWorkspaces(params.destPath);

    // Collect unique repos used across all workspaces
    const { uniqueSourceRepos } = collectWorkspaceRepos(
      workspaces,
      this.workspaceDir,
      params.sourcePath
    );

    // Fetch source repos
    await this.fetch.fetchRepos(uniqueSourceRepos, {
      silent: params.silent ?? false,
      ttlSeconds: params.fetchCacheTtlSeconds,
    });
  }
}
