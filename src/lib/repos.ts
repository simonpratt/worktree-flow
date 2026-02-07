import path from 'node:path';
import type { IFileSystem } from '../adapters/types.js';
import type { GitService } from './git.js';

export type RepoBranchCheckResult = {
  repoPath: string;
  repoName: string;
  hasBranch: boolean;
  error?: string;
};

/**
 * RepoService handles repository discovery and operations.
 */
export class RepoService {
  constructor(
    private fs: IFileSystem,
    private git?: GitService
  ) {}

  discoverRepos(sourcePath: string): string[] {
    const entries = this.fs.readdirSync(sourcePath, { withFileTypes: true });
    return entries
      .filter((entry: any) => entry.isDirectory())
      .map((entry: any) => path.join(sourcePath, entry.name))
      .filter((dirPath: string) => this.fs.existsSync(path.join(dirPath, '.git')))
      .sort();
  }

  static getRepoName(repoPath: string): string {
    return path.basename(repoPath);
  }

  /**
   * Find all repos that have a specific branch (checking local remote-tracking branches)
   */
  async findReposWithBranch(
    repos: string[],
    branchName: string
  ): Promise<{ matching: string[]; results: RepoBranchCheckResult[] }> {
    if (!this.git) {
      throw new Error('RepoService not configured with git service');
    }

    const results: RepoBranchCheckResult[] = [];
    const matching: string[] = [];

    for (const repoPath of repos) {
      const repoName = RepoService.getRepoName(repoPath);
      try {
        const hasBranch = await this.git.localRemoteBranchExists(repoPath, branchName);
        results.push({ repoPath, repoName, hasBranch });
        if (hasBranch) {
          matching.push(repoPath);
        }
      } catch (err: any) {
        results.push({
          repoPath,
          repoName,
          hasBranch: false,
          error: err.stderr || err.message,
        });
      }
    }

    return { matching, results };
  }

  /**
   * Format repo choices for checkbox selection
   */
  formatRepoChoices(repos: string[]): Array<{ name: string; value: string }> {
    return repos
      .map(repoPath => ({
        name: RepoService.getRepoName(repoPath),
        value: repoPath,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
