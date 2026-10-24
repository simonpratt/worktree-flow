import path from 'node:path';
import type { IFileSystem } from '../adapters/types.js';
import type { GitService } from './git.js';

export type CopyFailure = { file: string; error: string };

export type CopyConfigFilesResult = { failed: CopyFailure[] };

/**
 * WorktreeService handles worktree creation and file copying.
 * No orchestration - just individual worktree operations.
 */
export class WorktreeService {
  constructor(
    private fs: IFileSystem,
    private git: GitService
  ) {}

  /**
   * Copies each comma-separated `copyFiles` path from the source repo into the worktree,
   * creating parent directories that don't exist in the worktree (e.g. gitignored folders).
   * Files missing from the source repo are skipped; copy errors are returned, not thrown.
   */
  copyConfigFilesToWorktree(
    sourceRepoPath: string,
    worktreePath: string,
    copyFiles?: string
  ): CopyConfigFilesResult {
    // Default to no files if not specified
    const files = (copyFiles || '')
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    const failed: CopyFailure[] = [];

    // Copy each config file from source repo to worktree
    for (const file of files) {
      const sourceFilePath = path.join(sourceRepoPath, file);
      const destFilePath = path.join(worktreePath, file);

      // Skip if file doesn't exist in source repo
      if (!this.fs.existsSync(sourceFilePath)) {
        continue;
      }

      try {
        this.fs.mkdirSync(path.dirname(destFilePath), { recursive: true });
        this.fs.copyFileSync(sourceFilePath, destFilePath);
      } catch (error: any) {
        failed.push({ file, error: error?.message ?? String(error) });
      }
    }

    return { failed };
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

  async pruneWorktrees(repoPath: string): Promise<void> {
    await this.git.pruneWorktrees(repoPath);
  }
}
