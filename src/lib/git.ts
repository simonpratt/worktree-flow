import type { IShell } from '../adapters/types.js';

/**
 * GitService handles all git operations.
 */
export class GitService {
  constructor(private shell: IShell) {}

  private async exec(repoPath: string, args: string[]): Promise<string> {
    const { stdout } = await this.shell.execFile('git', ['-C', repoPath, ...args], {
      encoding: 'utf-8',
    });
    return stdout;
  }

  async fetch(repoPath: string): Promise<void> {
    await this.exec(repoPath, ['fetch', '--all', '--prune']);
  }

  async remoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
    const output = await this.exec(repoPath, ['ls-remote', '--heads', 'origin', branch]);
    return output.length > 0;
  }

  async localRemoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
    // Check for local branch first
    try {
      await this.exec(repoPath, ['rev-parse', '--verify', branch]);
      return true;
    } catch {
      // Fall back to checking remote-tracking branch
      try {
        await this.exec(repoPath, ['rev-parse', '--verify', `origin/${branch}`]);
        return true;
      } catch {
        return false;
      }
    }
  }

  async remoteTrackingBranchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      await this.exec(repoPath, ['rev-parse', '--verify', `origin/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  async findFirstExistingBranch(
    repoPath: string,
    candidates: string[]
  ): Promise<string | null> {
    for (const branch of candidates) {
      const exists = await this.localRemoteBranchExists(repoPath, branch);
      if (exists) return branch;
    }
    return null;
  }

  async addWorktreeNewBranch(
    repoPath: string,
    worktreePath: string,
    branch: string,
    sourceBranch?: string
  ): Promise<void> {
    const args = ['worktree', 'add', '--no-track', '-b', branch, worktreePath];
    if (sourceBranch) {
      args.push(sourceBranch);
    }
    await this.exec(repoPath, args);
  }

  async addWorktree(
    repoPath: string,
    worktreePath: string,
    branch: string
  ): Promise<void> {
    await this.exec(repoPath, ['worktree', 'add', worktreePath, branch]);
  }

  async pull(worktreePath: string): Promise<void> {
    await this.exec(worktreePath, ['pull']);
  }

  async push(worktreePath: string): Promise<void> {
    await this.exec(worktreePath, ['push']);
  }

  async pushSetUpstream(worktreePath: string, branch: string): Promise<void> {
    await this.exec(worktreePath, ['push', '--set-upstream', 'origin', branch]);
  }

  async getCurrentBranch(worktreePath: string): Promise<string> {
    const output = await this.exec(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return output.trim();
  }

  async getUpstreamBranch(worktreePath: string): Promise<string | null> {
    try {
      const output = await this.exec(worktreePath, ['rev-parse', '--abbrev-ref', '@{u}']);
      return output.trim();
    } catch {
      return null;
    }
  }

  async getStatusCounts(repoPath: string): Promise<{ untracked: number; uncommitted: number }> {
    const output = await this.exec(repoPath, ['status', '--porcelain']);
    const lines = output.split('\n').filter(line => line.length > 0);
    let untracked = 0;
    let uncommitted = 0;
    for (const line of lines) {
      if (line.startsWith('??')) {
        untracked++;
      } else {
        uncommitted++;
      }
    }
    return { untracked, uncommitted };
  }

  async getUnpushedCommitCount(repoPath: string): Promise<number> {
    try {
      const branch = await this.getCurrentBranch(repoPath);
      try {
        const output = await this.exec(repoPath, ['rev-list', '--count', `origin/${branch}..HEAD`]);
        return parseInt(output.trim(), 10);
      } catch {
        // origin/<branch> doesn't exist yet — count commits not reachable from any remote ref
        const output = await this.exec(repoPath, ['rev-list', '--count', 'HEAD', '--not', '--remotes']);
        return parseInt(output.trim(), 10);
      }
    } catch {
      return 0;
    }
  }

  async createBranch(repoPath: string, branchName: string, startPoint: string): Promise<void> {
    await this.exec(repoPath, ['branch', '--no-track', branchName, startPoint]);
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    await this.exec(repoPath, ['worktree', 'remove', worktreePath]);
  }

  async getLastCommitDate(repoPath: string): Promise<Date> {
    const output = await this.exec(repoPath, ['log', '-1', '--format=%aI', 'HEAD']);
    return new Date(output.trim());
  }

  /**
   * Push with automatic set-upstream retry if no upstream is configured
   */
  async pushWithRetry(worktreePath: string): Promise<string> {
    try {
      await this.push(worktreePath);
      return 'pushed';
    } catch (err: any) {
      const stderr = err.stderr || err.message || '';
      if (stderr.includes('no upstream') || stderr.includes('has no upstream')) {
        const branch = (await this.getCurrentBranch(worktreePath)).trim();
        await this.pushSetUpstream(worktreePath, branch);
        return 'pushed (set upstream)';
      }
      throw err;
    }
  }
}
