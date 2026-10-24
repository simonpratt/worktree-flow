import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { GitService } from '../lib/git.js';
import type { RepoService } from '../lib/repos.js';
import type { RenameRepoResult } from './renameWorkspaceBranches.js';

export type RenameWorkspaceFolderParams = {
  workspacePath: string;
  newBranchName: string;
  sourcePath: string;
  destPath: string;
};

export type RenameWorkspaceFolderResult = {
  newWorkspacePath: string;
  /** Repos whose worktree could not be repaired at the new location. */
  failedRepos: Required<RenameRepoResult>[];
};

/**
 * Use case for moving a workspace directory to match a new branch name: renames
 * it in one atomic filesystem move (preserving inodes, so any shell already
 * inside it — e.g. a tmux pane — keeps working against the same directory at
 * its new location), then repairs each repo's worktree admin data to match.
 */
export class RenameWorkspaceFolderUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private git: GitService,
    private repos: RepoService
  ) {}

  async execute(params: RenameWorkspaceFolderParams): Promise<RenameWorkspaceFolderResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);
    const worktreeDirNames = worktreeDirs.map((dir) => path.basename(dir));

    // 1. Rename the whole workspace directory in a single move
    const newWorkspacePath = this.workspaceDir.renameWorkspaceDir(
      params.workspacePath,
      params.destPath,
      params.newBranchName
    );

    // 2. Repair each worktree's admin data now that it has physically moved
    const allRepos = this.repos.discoverRepos(params.sourcePath);

    const results = await Promise.allSettled(
      worktreeDirNames.map(async (repoName) => {
        const sourceRepoPath = path.join(params.sourcePath, repoName);

        if (!allRepos.includes(sourceRepoPath)) {
          throw new Error('source repo not found');
        }

        await this.git.repairWorktree(sourceRepoPath, path.join(newWorkspacePath, repoName));
      })
    );

    const failedRepos = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [];
      }
      const err: any = result.reason;
      return [
        {
          repoName: worktreeDirNames[index],
          error: err?.stderr || err?.message || 'unknown error',
        },
      ];
    });

    return { newWorkspacePath, failedRepos };
  }
}
