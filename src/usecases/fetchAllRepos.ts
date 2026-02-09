import type { FetchService } from '../lib/fetch.js';
import type { RepoService } from '../lib/repos.js';

export type FetchAllReposParams = {
  sourcePath: string;
  fetchCacheTtlSeconds: number;
};

/**
 * Use case for fetching multiple repositories from source-path.
 * Centralizes fetch logic that was previously scattered across multiple use cases.
 */
export class FetchAllReposUseCase {
  constructor(
    private fetch: FetchService,
    private repos: RepoService
  ) {}

  async execute(params: FetchAllReposParams): Promise<void> {
    const allRepos = this.repos.discoverRepos(params.sourcePath);
    await this.fetch.fetchRepos(allRepos, { ttlSeconds: params.fetchCacheTtlSeconds });
  }
}
