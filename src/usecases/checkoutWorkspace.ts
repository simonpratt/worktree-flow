import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { WorktreeService } from '../lib/worktree.js';
import { RepoService, type RepoBranchCheckResult } from '../lib/repos.js';
import type { GitService } from '../lib/git.js';
import type { ParallelService } from '../lib/parallel.js';
import type { TmuxService } from '../lib/tmux.js';
import type { RunPostCheckoutUseCase } from './runPostCheckout.js';
import { NoReposFoundError } from '../lib/errors.js';

export type CheckoutWorkspaceParams = {
  branchName: string;
  sourcePath: string;
  destPath: string;
  copyFiles?: string;
  tmux: boolean;
  postCheckout?: string;
  perRepoPostCheckout?: Record<string, string>;
};

export type CheckoutWorkspaceResult = {
  workspacePath: string;
  matchingRepos: number;
  successCount: number;
  totalCount: number;
  tmuxCreated: boolean;
  postCheckoutSuccess?: number;
  postCheckoutTotal?: number;
  branchCheckResults: RepoBranchCheckResult[];
};

/**
 * Use case for checking out an existing branch across multiple repos.
 * Orchestrates repo discovery, branch checking, and workspace creation.
 */
export class CheckoutWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService,
    private worktree: WorktreeService,
    private repos: RepoService,
    private git: GitService,
    private parallel: ParallelService,
    private tmux: TmuxService,
    private runPostCheckout: RunPostCheckoutUseCase
  ) {}

  async execute(params: CheckoutWorkspaceParams): Promise<CheckoutWorkspaceResult> {
    // 1. Discover all repos
    const allRepos = this.repos.discoverRepos(params.sourcePath);
    if (allRepos.length === 0) {
      throw new NoReposFoundError(params.sourcePath);
    }

    // 2. Find repos that have this branch
    const { matching, results } = await this.repos.findReposWithBranch(
      allRepos,
      params.branchName
    );

    if (matching.length === 0) {
      throw new Error(`Branch "${params.branchName}" not found in any repo.`);
    }

    // 3. Create workspace directory
    const workspacePath = this.workspaceDir.createWorkspaceDir(
      params.destPath,
      params.branchName
    );

    // 4. Create worktrees in parallel
    const successCount = await this.parallel.processInParallel(
      matching,
      (repoPath) => RepoService.getRepoName(repoPath),
      async (repoPath) => {
        const name = RepoService.getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, name);

        await this.worktree.createWorktreeCheckout(
          repoPath,
          worktreeDest,
          params.branchName
        );

        this.worktree.copyConfigFilesToWorktree(
          repoPath,
          worktreeDest,
          params.copyFiles
        );

        return 'created';
      }
    );

    // 5. Copy AGENTS.md
    this.workspaceDir.copyAgentsMd(params.sourcePath, workspacePath);

    // 6. Detect base branches for each repo
    const baseBranches: Record<string, string> = {};
    for (const repoPath of matching) {
      const repoName = RepoService.getRepoName(repoPath);
      const baseBranch = await this.git.findFirstExistingBranch(
        repoPath,
        ['master', 'main', 'trunk', 'develop']
      );
      baseBranches[repoName] = baseBranch || 'master';
    }

    // 7. Save workspace config with base branches
    this.workspaceConfig.save(workspacePath, { baseBranches });

    // 8. Create tmux session if enabled
    let tmuxCreated = false;
    if (params.tmux) {
      try {
        const worktreeDirs = this.workspaceDir.getWorktreeDirs(workspacePath);
        await this.tmux.createSession(workspacePath, params.branchName, worktreeDirs);
        tmuxCreated = true;
      } catch (error) {
        // Don't fail
      }
    }

    // 9. Run post-checkout if configured
    const postCheckoutResult = await this.runPostCheckout.execute({
      workspacePath,
      sessionName: tmuxCreated ? params.branchName : undefined,
      tmuxEnabled: tmuxCreated,
      postCheckout: params.postCheckout,
      perRepoPostCheckout: params.perRepoPostCheckout,
    });

    return {
      workspacePath,
      matchingRepos: matching.length,
      successCount,
      totalCount: matching.length,
      tmuxCreated,
      postCheckoutSuccess: postCheckoutResult?.successCount,
      postCheckoutTotal: postCheckoutResult?.totalCount,
      branchCheckResults: results,
    };
  }
}
