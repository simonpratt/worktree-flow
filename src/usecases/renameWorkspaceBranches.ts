import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { GitService } from '../lib/git.js';
import type { RepoService } from '../lib/repos.js';

export type RenameWorkspaceBranchesParams = {
  workspacePath: string;
  newBranchName: string;
  sourcePath: string;
  /** Repos to leave untouched, e.g. because an earlier step already failed for them. */
  skipRepos?: string[];
};

export type RenameRepoResult = {
  repoName: string;
  error?: string;
};

export type RenameWorkspaceBranchesResult = {
  repoResults: RenameRepoResult[];
};

/**
 * Use case for renaming a workspace's branches in place: records the new
 * branch name in the workspace config, then branches each repo from the head
 * of its current branch and switches the worktree onto the new branch.
 */
export class RenameWorkspaceBranchesUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService,
    private git: GitService,
    private repos: RepoService
  ) {}

  async execute(params: RenameWorkspaceBranchesParams): Promise<RenameWorkspaceBranchesResult> {
    const skipRepos = params.skipRepos ?? [];
    const worktreeDirNames = this.workspaceDir
      .getWorktreeDirs(params.workspacePath)
      .map((dir) => path.basename(dir))
      .filter((repoName) => !skipRepos.includes(repoName));

    // 1. Record the new branch name so the workspace resolves to it (and its tmux session)
    this.workspaceConfig.setBranchName(params.workspacePath, params.newBranchName);

    // 2. For each repo: branch from its current HEAD, then switch the worktree onto it
    const allRepos = this.repos.discoverRepos(params.sourcePath);

    const results = await Promise.allSettled(
      worktreeDirNames.map(async (repoName) => {
        const sourceRepoPath = path.join(params.sourcePath, repoName);
        const worktreePath = path.join(params.workspacePath, repoName);

        if (!allRepos.includes(sourceRepoPath)) {
          throw new Error('source repo not found');
        }

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

    const repoResults: RenameRepoResult[] = results.map((result, index) => {
      const repoName = worktreeDirNames[index];
      if (result.status === 'fulfilled') {
        return { repoName };
      }
      const err: any = result.reason;
      return { repoName, error: err?.stderr || err?.message || 'unknown error' };
    });

    return { repoResults };
  }
}
