import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { WorktreeService } from '../lib/worktree.js';
import { RepoService } from '../lib/repos.js';
import type { GitService } from '../lib/git.js';
import type { ParallelService } from '../lib/parallel.js';
import type { TmuxService } from '../lib/tmux.js';
import type { RunPostCheckoutUseCase } from './runPostCheckout.js';

export type CreateBranchWorkspaceParams = {
  repos: string[];
  branchName: string;
  sourceBranch: string;
  sourcePath: string;
  destPath: string;
  copyFiles?: string;
  tmux: boolean;
  postCheckout?: string;
  perRepoPostCheckout?: Record<string, string>;
};

export type CreateBranchWorkspaceResult = {
  workspacePath: string;
  successCount: number;
  totalCount: number;
  tmuxCreated: boolean;
  postCheckoutSuccess?: number;
  postCheckoutTotal?: number;
};

/**
 * Use case for creating a workspace with new branches across multiple repos.
 * Orchestrates the entire workflow from workspace creation to post-checkout commands.
 */
export class CreateBranchWorkspaceUseCase {
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

  async execute(params: CreateBranchWorkspaceParams): Promise<CreateBranchWorkspaceResult> {
    // 1. Create workspace directory
    const workspacePath = this.workspaceDir.createWorkspaceDir(
      params.destPath,
      params.branchName
    );

    // Track base branches for each repo
    const baseBranches: Record<string, string> = {};

    // 2. Create worktrees in parallel
    const successCount = await this.parallel.processInParallel(
      params.repos,
      (repoPath) => RepoService.getRepoName(repoPath),
      async (repoPath) => {
        const name = RepoService.getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, name);

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
          params.branchName,
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

    // 3. Copy AGENTS.md if exists
    this.workspaceDir.copyAgentsMd(params.sourcePath, workspacePath);

    // 4. Save workspace config with base branches
    this.workspaceConfig.save(workspacePath, { baseBranches });

    // 5. Create tmux session if enabled
    let tmuxCreated = false;
    if (params.tmux) {
      try {
        const worktreeDirs = this.workspaceDir.getWorktreeDirs(workspacePath);
        await this.tmux.createSession(workspacePath, params.branchName, worktreeDirs);
        tmuxCreated = true;
      } catch (error) {
        // Don't fail, just return false
      }
    }

    // 6. Run post-checkout command if configured
    const postCheckoutResult = await this.runPostCheckout.execute({
      workspacePath,
      sessionName: tmuxCreated ? params.branchName : undefined,
      tmuxEnabled: tmuxCreated,
      postCheckout: params.postCheckout,
      perRepoPostCheckout: params.perRepoPostCheckout,
    });

    return {
      workspacePath,
      successCount,
      totalCount: params.repos.length,
      tmuxCreated,
      postCheckoutSuccess: postCheckoutResult?.successCount,
      postCheckoutTotal: postCheckoutResult?.totalCount,
    };
  }
}
