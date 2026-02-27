import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { TmuxService } from '../lib/tmux.js';
import type { AddReposToWorkspaceUseCase } from './addReposToWorkspace.js';

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
 * Orchestrates workspace creation, then delegates worktree setup to AddReposToWorkspaceUseCase.
 */
export class CreateBranchWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService,
    private tmux: TmuxService,
    private addRepos: AddReposToWorkspaceUseCase
  ) {}

  async execute(params: CreateBranchWorkspaceParams): Promise<CreateBranchWorkspaceResult> {
    // 1. Create workspace directory
    const workspacePath = this.workspaceDir.createWorkspaceDir(
      params.destPath,
      params.branchName
    );
    this.workspaceConfig.savePlaceholder(workspacePath);

    // 2. Add repos to workspace (create worktrees, copy config, run post-checkout)
    const addResult = await this.addRepos.execute({
      repos: params.repos,
      workspacePath,
      branchName: params.branchName,
      sourceBranch: params.sourceBranch,
      copyFiles: params.copyFiles,
      postCheckout: params.postCheckout,
      perRepoPostCheckout: params.perRepoPostCheckout,
    });

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

    return {
      workspacePath,
      successCount: addResult.successCount,
      totalCount: addResult.totalCount,
      tmuxCreated,
      postCheckoutSuccess: addResult.postCheckoutSuccess,
      postCheckoutTotal: addResult.postCheckoutTotal,
    };
  }
}
