import type { GitService } from './git.js';

export type WorktreeStatus = {
  type: 'clean' | 'uncommitted' | 'ahead' | 'behind' | 'diverged' | 'error';
  error?: string;
  comparedTo?: 'origin' | 'main';
};

/**
 * StatusService handles worktree status checking.
 */
export class StatusService {
  constructor(private git: GitService) {}

  async getWorktreeStatus(
    worktreePath: string,
    mainBranch: string
  ): Promise<WorktreeStatus> {
    try {
      // Always check for uncommitted changes first
      const hasUncommitted = await this.git.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        return { type: 'uncommitted' };
      }

      // Check if origin branch exists
      const hasOriginBranch = await this.git.originBranchExists(worktreePath);

      if (hasOriginBranch) {
        // Compare against origin branch
        const isAhead = await this.git.isAheadOfOrigin(worktreePath);
        const isBehind = await this.git.isBehindOrigin(worktreePath);

        if (isAhead && isBehind) {
          return { type: 'diverged', comparedTo: 'origin' };
        }
        if (isAhead) {
          return { type: 'ahead', comparedTo: 'origin' };
        }
        if (isBehind) {
          return { type: 'behind', comparedTo: 'origin' };
        }

        return { type: 'clean', comparedTo: 'origin' };
      }

      // No origin branch, compare against main
      const isAhead = await this.git.isAheadOfMain(worktreePath, mainBranch);
      if (isAhead) {
        return { type: 'ahead', comparedTo: 'main' };
      }

      return { type: 'clean', comparedTo: 'main' };
    } catch (err: any) {
      return {
        type: 'error',
        error: err.stderr || err.message,
      };
    }
  }

  static getStatusMessage(status: WorktreeStatus, mainBranch: string): string {
    switch (status.type) {
      case 'clean':
        return 'up to date';
      case 'uncommitted':
        return 'uncommitted changes';
      case 'ahead':
        return status.comparedTo === 'origin'
          ? 'ahead of origin'
          : `ahead of ${mainBranch}`;
      case 'behind':
        return 'behind origin';
      case 'diverged':
        return 'diverged from origin';
      case 'error':
        return `error: ${status.error}`;
    }
  }

  static hasIssues(status: WorktreeStatus): boolean {
    return (
      status.type === 'uncommitted' ||
      status.type === 'ahead' ||
      status.type === 'diverged' ||
      status.type === 'error'
    );
  }

  /**
   * Check status of all worktrees in parallel
   */
  async checkAllWorktrees(
    worktreeDirs: string[],
    mainBranch: string
  ): Promise<Array<{ repoName: string; status: WorktreeStatus }>> {
    const results = await Promise.all(
      worktreeDirs.map(async (worktreePath) => {
        const repoName = worktreePath.split('/').pop() || worktreePath;
        const status = await this.getWorktreeStatus(worktreePath, mainBranch);
        return { repoName, status };
      })
    );

    return results;
  }

  /**
   * Find repos with issues (for removal validation)
   */
  async findReposWithIssues(
    worktreeDirs: string[],
    mainBranch: string
  ): Promise<string[]> {
    const results = await this.checkAllWorktrees(worktreeDirs, mainBranch);
    return results
      .filter(({ status }) => StatusService.hasIssues(status))
      .map(({ repoName }) => repoName);
  }
}
