import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorktreeService } from '../lib/worktree.js';
import { RepoService } from '../lib/repos.js';
import type { ParallelService } from '../lib/parallel.js';
import type { TmuxService } from '../lib/tmux.js';
import type { PostCheckoutService } from '../lib/postCheckout.js';

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
    private worktree: WorktreeService,
    private repos: RepoService,
    private parallel: ParallelService,
    private tmux: TmuxService,
    private postCheckout: PostCheckoutService
  ) {}

  async execute(params: CreateBranchWorkspaceParams): Promise<CreateBranchWorkspaceResult> {
    // 1. Create workspace directory
    const workspacePath = this.workspaceDir.createWorkspaceDir(
      params.destPath,
      params.branchName
    );

    // 2. Create worktrees in parallel
    const successCount = await this.parallel.processInParallel(
      params.repos,
      (repoPath) => RepoService.getRepoName(repoPath),
      async (repoPath) => {
        const name = RepoService.getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, name);

        await this.worktree.createWorktreeWithBranch(
          repoPath,
          worktreeDest,
          params.branchName,
          params.sourceBranch
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

    // 4. Create tmux session if enabled
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

    // 5. Run post-checkout command if configured
    let postCheckoutResult;
    if (params.postCheckout || params.perRepoPostCheckout) {
      const worktreeDirs = this.workspaceDir.getWorktreeDirs(workspacePath);
      postCheckoutResult = await this.postCheckout.runCommand(
        worktreeDirs,
        params.postCheckout,
        params.perRepoPostCheckout ?? {}
      );
    }

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
