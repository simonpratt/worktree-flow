import type { GitService } from './git.js';

export type WorktreeStatus = {
  type: 'clean' | 'uncommitted' | 'ahead' | 'error';
  error?: string;
  comparedTo?: 'main';
  currentBranch?: string;
  upstreamBranch?: string | null;
};

/**
 * StatusService handles worktree status checking.
 */
export class StatusService {
  constructor(private git: GitService) {}

  async getWorktreeStatus(
    worktreePath: string,
    baseBranch: string
  ): Promise<WorktreeStatus> {
    try {
      // Get branch information
      const currentBranch = await this.git.getCurrentBranch(worktreePath);
      const upstreamBranch = await this.git.getUpstreamBranch(worktreePath);

      // Check for uncommitted changes first
      const hasUncommitted = await this.git.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        return { type: 'uncommitted', currentBranch, upstreamBranch };
      }

      // Compare against base branch using git cherry (handles squash merges)
      const isAhead = await this.git.isAheadOfMain(worktreePath, baseBranch);
      if (isAhead) {
        return { type: 'ahead', comparedTo: 'main', currentBranch, upstreamBranch };
      }

      return { type: 'clean', comparedTo: 'main', currentBranch, upstreamBranch };
    } catch (err: any) {
      return {
        type: 'error',
        error: err.stderr || err.message,
      };
    }
  }

  static getStatusMessage(status: WorktreeStatus, baseBranch: string): string {
    switch (status.type) {
      case 'clean':
        return 'up to date';
      case 'uncommitted':
        return 'uncommitted changes';
      case 'ahead':
        return `ahead of ${baseBranch}`;
      case 'error':
        return `error: ${status.error}`;
    }
  }

  static hasIssues(status: WorktreeStatus): boolean {
    return (
      status.type === 'uncommitted' ||
      status.type === 'error'
    );
  }

  /**
   * Check status of all worktrees in parallel
   */
  async checkAllWorktrees(
    worktreeDirs: string[],
    getBaseBranch: (repoName: string) => string
  ): Promise<Array<{ repoName: string; status: WorktreeStatus }>> {
    const results = await Promise.all(
      worktreeDirs.map(async (worktreePath) => {
        const repoName = worktreePath.split('/').pop() || worktreePath;
        const baseBranch = getBaseBranch(repoName);
        const status = await this.getWorktreeStatus(worktreePath, baseBranch);
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
    getBaseBranch: (repoName: string) => string
  ): Promise<string[]> {
    const results = await this.checkAllWorktrees(worktreeDirs, getBaseBranch);
    return results
      .filter(({ status }) => StatusService.hasIssues(status))
      .map(({ repoName }) => repoName);
  }
}
