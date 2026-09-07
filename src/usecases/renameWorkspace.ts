import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { GitService } from '../lib/git.js';
import type { TmuxService } from '../lib/tmux.js';
import type { RepoService } from '../lib/repos.js';

export type RenameWorkspaceParams = {
  workspacePath: string;
  oldBranchName: string;
  newBranchName: string;
  sourcePath: string;
  destPath: string;
  tmux: boolean;
};

export type RenameWorkspaceRepoResult = {
  repoName: string;
  error?: string;
};

export type RenameWorkspaceResult = {
  newWorkspacePath: string;
  repoResults: RenameWorkspaceRepoResult[];
  tmuxRenamed: boolean;
};

/**
 * Use case for renaming a workspace: renames the workspace directory in one
 * atomic filesystem move (preserving inodes, so any shell already inside it —
 * e.g. a tmux pane — keeps working against the same directory at its new
 * location), repairs each repo's worktree admin data to match, branches from
 * the head of its current branch, switches the worktree onto the new branch,
 * and renames the tmux session if present.
 */
export class RenameWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private git: GitService,
    private tmux: TmuxService,
    private repos: RepoService
  ) {}

  async execute(params: RenameWorkspaceParams): Promise<RenameWorkspaceResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);
    const worktreeDirNames = worktreeDirs.map((dir) => path.basename(dir));

    // 1. Rename the whole workspace directory in a single move
    const newWorkspacePath = this.workspaceDir.renameWorkspaceDir(
      params.workspacePath,
      params.destPath,
      params.newBranchName
    );

    // 2. For each repo: repair the worktree's admin data now that it has
    // physically moved, branch from its current HEAD, then switch it onto the
    // new branch.
    const allRepos = this.repos.discoverRepos(params.sourcePath);

    const results = await Promise.allSettled(
      worktreeDirNames.map(async (repoName) => {
        const sourceRepoPath = path.join(params.sourcePath, repoName);
        const worktreePath = path.join(newWorkspacePath, repoName);

        if (!allRepos.includes(sourceRepoPath)) {
          throw new Error('source repo not found');
        }

        await this.git.repairWorktree(sourceRepoPath, worktreePath);

        const currentBranch = await this.git.getCurrentBranch(worktreePath);

        const branchAlreadyExists = await this.git.hasLocalBranch(
          sourceRepoPath,
          params.newBranchName
        );
        if (!branchAlreadyExists) {
          await this.git.createBranch(sourceRepoPath, params.newBranchName, currentBranch);
        }

        await this.git.checkout(worktreePath, params.newBranchName);
      })
    );

    const repoResults: RenameWorkspaceRepoResult[] = results.map((result, index) => {
      const repoName = worktreeDirNames[index];
      if (result.status === 'fulfilled') {
        return { repoName };
      }
      const err: any = result.reason;
      return { repoName, error: err?.stderr || err?.message || 'unknown error' };
    });

    // 3. Rename the tmux session, if one exists
    let tmuxRenamed = false;
    if (params.tmux) {
      try {
        const exists = await this.tmux.sessionExists(params.oldBranchName);
        if (exists) {
          await this.tmux.renameSession(params.oldBranchName, params.newBranchName);
          tmuxRenamed = true;
        }
      } catch {
        // Don't fail the rename if the tmux session couldn't be renamed
      }
    }

    return {
      newWorkspacePath,
      repoResults,
      tmuxRenamed,
    };
  }
}
