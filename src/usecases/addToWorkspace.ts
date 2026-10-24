import path from 'node:path';
import type { CopyFailure, WorktreeService } from '../lib/worktree.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { RepoConfigService } from '../lib/repoConfig.js';

export type AddToWorkspaceParams = {
  repoPath: string;
  workspacePath: string;
  branchName: string;
  baseBranch: string;
  copyFiles?: string;
};

export type AddToWorkspaceResult = {
  repoName: string;
  worktreePath: string;
  /** copy-files entries that exist in the source repo but failed to copy */
  copyFailures: CopyFailure[];
};

/**
 * Use case for adding a single repo to an existing workspace.
 * Creates a worktree for an existing branch, copies config files (reporting failures),
 * and saves base branch to workspace config. Terminals and post-checkout are
 * handled once all repos are added, by OpenWorkspaceSessionUseCase.
 */
export class AddToWorkspaceUseCase {
  constructor(
    private worktree: WorktreeService,
    private workspaceConfig: WorkspaceConfigService,
    private repoConfig: RepoConfigService
  ) {}

  async execute(params: AddToWorkspaceParams): Promise<AddToWorkspaceResult> {
    const repoName = path.basename(params.repoPath);
    const worktreeDest = path.join(params.workspacePath, repoName);

    // 1. Create worktree by checking out the existing branch
    await this.worktree.createWorktreeCheckout(params.repoPath, worktreeDest, params.branchName);

    // 2. Resolve and copy config files using repo-level overrides with global fallback
    const repoConf = this.repoConfig.load(params.repoPath);
    const resolvedCopyFiles = this.repoConfig.resolveCopyFiles(repoConf, params.copyFiles);
    const { failed: copyFailures } = this.worktree.copyConfigFilesToWorktree(
      params.repoPath,
      worktreeDest,
      resolvedCopyFiles
    );

    // 3. Save base branch to workspace config
    this.workspaceConfig.save(params.workspacePath, {
      baseBranches: { [repoName]: params.baseBranch },
    });

    return {
      repoName,
      worktreePath: worktreeDest,
      copyFailures,
    };
  }
}
