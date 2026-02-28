import type { RepoService, RepoBranchCheckResult } from '../lib/repos.js';
import { NoReposFoundError } from '../lib/errors.js';

export type DiscoverReposWithBranchParams = {
  sourcePath: string;
  branchName: string;
};

export type DiscoverReposWithBranchResult = {
  allRepos: string[];
  matchingRepos: string[];
  branchCheckResults: RepoBranchCheckResult[];
};

/**
 * Use case for discovering repos in source-path and checking which ones have a given branch.
 * Extracts repo discovery + branch checking logic into a focused, reusable use case.
 */
export class DiscoverReposWithBranchUseCase {
  constructor(private repos: RepoService) {}

  async execute(params: DiscoverReposWithBranchParams): Promise<DiscoverReposWithBranchResult> {
    // 1. Discover all repos
    const allRepos = this.repos.discoverRepos(params.sourcePath);
    if (allRepos.length === 0) {
      throw new NoReposFoundError(params.sourcePath);
    }

    // 2. Check which repos have the branch
    const { matching, results } = await this.repos.findReposWithBranch(
      allRepos,
      params.branchName
    );

    return {
      allRepos,
      matchingRepos: matching,
      branchCheckResults: results,
    };
  }
}
