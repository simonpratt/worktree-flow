import path from 'node:path';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { WorktreeService } from '../lib/worktree.js';
import { RepoService } from '../lib/repos.js';
import type { GitService } from '../lib/git.js';
import type { ParallelService } from '../lib/parallel.js';
import type { RunPostCheckoutUseCase } from './runPostCheckout.js';

export type AddReposToWorkspaceParams = {
  repos: string[];
  workspacePath: string;
  branchName?: string;
  sourceBranch: string;
  copyFiles?: string;
  tmux?: boolean;
  postCheckout?: string;
  perRepoPostCheckout?: Record<string, string>;
};

export type AddReposToWorkspaceResult = {
  successCount: number;
  totalCount: number;
  postCheckoutSuccess?: number;
  postCheckoutTotal?: number;
};

/**
 * Use case for adding repos to an existing workspace.
 * Creates worktrees with new branches, copies config files, and runs post-checkout.
 * Reused by both CreateBranchWorkspaceUseCase and the 'add' command.
 */
export class AddReposToWorkspaceUseCase {
  constructor(
    private workspaceConfig: WorkspaceConfigService,
    private worktree: WorktreeService,
    private git: GitService,
    private parallel: ParallelService,
    private runPostCheckout: RunPostCheckoutUseCase
  ) {}

  async execute(params: AddReposToWorkspaceParams): Promise<AddReposToWorkspaceResult> {
    const branchName = params.branchName ?? path.basename(params.workspacePath);

    // Track base branches for each repo
    const baseBranches: Record<string, string> = {};

    // Create worktrees in parallel
    const successCount = await this.parallel.processInParallel(
      params.repos,
      (repoPath) => RepoService.getRepoName(repoPath),
      async (repoPath) => {
        const name = RepoService.getRepoName(repoPath);
        const worktreeDest = path.join(params.workspacePath, name);

        // Determine which base branch to use
        let actualBaseBranch = params.sourceBranch;

        // Try the user-specified source branch first, fall back if it doesn't exist
        const branchExists = await this.git.localRemoteBranchExists(repoPath, params.sourceBranch);
        if (!branchExists) {
          const fallbackBranch = await this.git.findFirstExistingBranch(
            repoPath,
            ['master', 'main', 'trunk', 'develop']
          );
          if (fallbackBranch) {
            actualBaseBranch = fallbackBranch;
          }
          // If no fallback found, still try with the original (will fail with clear error)
        }

        // Track the actual base branch used
        baseBranches[name] = actualBaseBranch;

        await this.worktree.createWorktreeWithBranch(
          repoPath,
          worktreeDest,
          branchName,
          `origin/${actualBaseBranch}`
        );

        this.worktree.copyConfigFilesToWorktree(
          repoPath,
          worktreeDest,
          params.copyFiles
        );

        return 'created';
      }
    );

    // Save workspace config with base branches (merges with existing)
    this.workspaceConfig.save(params.workspacePath, { baseBranches });

    // Run post-checkout command if configured
    const postCheckoutResult = await this.runPostCheckout.execute({
      workspacePath: params.workspacePath,
      tmuxEnabled: false,
      postCheckout: params.postCheckout,
      perRepoPostCheckout: params.perRepoPostCheckout,
    });

    return {
      successCount,
      totalCount: params.repos.length,
      postCheckoutSuccess: postCheckoutResult?.successCount,
      postCheckoutTotal: postCheckoutResult?.totalCount,
    };
  }
}
