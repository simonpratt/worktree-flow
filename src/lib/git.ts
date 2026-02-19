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

  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    const output = await this.exec(repoPath, ['status', '--porcelain']);
    return output.length > 0;
  }

  async originBranchExists(repoPath: string): Promise<boolean> {
    try {
      const branch = await this.getCurrentBranch(repoPath);
      await this.exec(repoPath, ['rev-parse', '--verify', `origin/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  async isAheadOfOrigin(repoPath: string): Promise<boolean> {
    try {
      const branch = await this.getCurrentBranch(repoPath);
      const output = await this.exec(repoPath, ['rev-list', '--count', `origin/${branch}..HEAD`]);
      return parseInt(output, 10) > 0;
    } catch {
      return false;
    }
  }

  async isBehindOrigin(repoPath: string): Promise<boolean> {
    try {
      const branch = await this.getCurrentBranch(repoPath);
      const output = await this.exec(repoPath, ['rev-list', '--count', `HEAD..origin/${branch}`]);
      return parseInt(output, 10) > 0;
    } catch {
      return false;
    }
  }

  async isAheadOfMain(repoPath: string, mainBranch: string): Promise<boolean> {
    try {
      // Use git cherry to detect if commits exist in main via patch equivalence
      // cherry outputs nothing if all commits are equivalent to main
      // Format: "+ hash message" for unmerged, "- hash message" for already merged
      const output = await this.exec(repoPath, ['cherry', `origin/${mainBranch}`, 'HEAD']);

      // Filter to only unmerged commits (those starting with +)
      const unmergedCommits = output
        .split('\n')
        .filter(line => line.trim().startsWith('+'));

      return unmergedCommits.length > 0;
    } catch {
      // If we can't determine, assume there are changes to be safe
      return true;
    }
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
