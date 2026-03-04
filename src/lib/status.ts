import type { GitService } from './git.js';

export type WorktreeStatus = {
  type: 'clean' | 'dirty' | 'error';
  untracked: number;
  uncommitted: number;
  unpushed: number;
  error?: string;
  currentBranch?: string;
  upstreamBranch?: string | null;
};

/**
 * StatusService handles worktree status checking.
 */
export class StatusService {
  constructor(private git: GitService) {}

  async getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
    try {
      const currentBranch = await this.git.getCurrentBranch(worktreePath);
      const upstreamBranch = await this.git.getUpstreamBranch(worktreePath);

      const { untracked, uncommitted } = await this.git.getStatusCounts(worktreePath);
      const unpushed = await this.git.getUnpushedCommitCount(worktreePath);

      const type = untracked > 0 || uncommitted > 0 ? 'dirty' : 'clean';

      return { type, untracked, uncommitted, unpushed, currentBranch, upstreamBranch };
    } catch (err: any) {
      return {
        type: 'error',
        untracked: 0,
        uncommitted: 0,
        unpushed: 0,
        error: err.stderr || err.message,
      };
    }
  }

  static getStatusMessage(status: WorktreeStatus): string {
    if (status.type === 'error') {
      return `error: ${status.error}`;
    }

    if (status.type === 'clean' && status.unpushed === 0) {
      return 'clean';
    }

    const parts: string[] = [];
    if (status.untracked > 0) {
      parts.push(`${status.untracked} untracked`);
    }
    if (status.uncommitted > 0) {
      parts.push(`${status.uncommitted} modified`);
    }
    if (status.unpushed > 0) {
      parts.push(`${status.unpushed} unpushed commit${status.unpushed === 1 ? '' : 's'}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'clean';
  }

  static hasIssues(status: WorktreeStatus): boolean {
    return (
      status.untracked > 0 ||
      status.uncommitted > 0 ||
      status.type === 'error'
    );
  }

  /**
   * Check status of all worktrees in parallel
   */
  async checkAllWorktrees(
    worktreeDirs: string[]
  ): Promise<Array<{ repoName: string; status: WorktreeStatus }>> {
    const results = await Promise.all(
      worktreeDirs.map(async (worktreePath) => {
        const repoName = worktreePath.split('/').pop() || worktreePath;
        const status = await this.getWorktreeStatus(worktreePath);
        return { repoName, status };
      })
    );

    return results;
  }

  /**
   * Find repos with issues (for removal validation)
   */
  async findReposWithIssues(worktreeDirs: string[]): Promise<string[]> {
    const results = await this.checkAllWorktrees(worktreeDirs);
    return results
      .filter(({ status }) => StatusService.hasIssues(status))
      .map(({ repoName }) => repoName);
  }
}
