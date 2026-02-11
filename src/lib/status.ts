import type { GitService } from './git.js';

export type WorktreeStatus = {
  type: 'clean' | 'uncommitted' | 'ahead' | 'error';
  error?: string;
  comparedTo?: 'main';
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
      // Check for uncommitted changes first
      const hasUncommitted = await this.git.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        return { type: 'uncommitted' };
      }

      // Compare against main using git cherry (handles squash merges)
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
        return `ahead of ${mainBranch}`;
      case 'error':
        return `error: ${status.error}`;
    }
  }

  static hasIssues(status: WorktreeStatus): boolean {
    return (
      status.type === 'uncommitted' ||
      status.type === 'ahead' ||
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
