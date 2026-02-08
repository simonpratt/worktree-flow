import path from 'node:path';
import type { IFileSystem } from '../adapters/types.js';
import type { GitService } from './git.js';

/**
 * WorktreeService handles worktree creation and file copying.
 * No orchestration - just individual worktree operations.
 */
export class WorktreeService {
  constructor(
    private fs: IFileSystem,
    private git: GitService
  ) {}

  copyConfigFilesToWorktree(
    sourceRepoPath: string,
    worktreePath: string,
    copyFiles?: string
  ): void {
    // Default to no files if not specified
    const files = (copyFiles || '')
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    // Copy each config file from source repo to worktree
    for (const file of files) {
      const sourceFilePath = path.join(sourceRepoPath, file);
      const destFilePath = path.join(worktreePath, file);

      // Skip if file doesn't exist in source repo
      if (!this.fs.existsSync(sourceFilePath)) {
        continue;
      }

      // Copy file to worktree
      try {
        this.fs.copyFileSync(sourceFilePath, destFilePath);
      } catch {
        // Silently ignore copy errors
      }
    }
  }

  async createWorktreeWithBranch(
    repoPath: string,
    worktreePath: string,
    branchName: string,
    sourceBranch: string
  ): Promise<void> {
    await this.git.addWorktreeNewBranch(repoPath, worktreePath, branchName, sourceBranch);
  }

  async createWorktreeCheckout(
    repoPath: string,
    worktreePath: string,
    branchName: string
  ): Promise<void> {
    await this.git.addWorktree(repoPath, worktreePath, branchName);
  }

  async removeWorktree(
    repoPath: string,
    worktreePath: string
  ): Promise<void> {
    await this.git.removeWorktree(repoPath, worktreePath);
  }
}
