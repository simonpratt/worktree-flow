import path from 'node:path';
import type { WorktreeService } from '../lib/worktree.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { RepoConfigService } from '../lib/repoConfig.js';
import type { PostCheckoutService } from '../lib/postCheckout.js';
import type { TmuxService } from '../lib/tmux.js';

export type AddToWorkspaceParams = {
  repoPath: string;
  workspacePath: string;
  branchName: string;
  baseBranch: string;
  sessionName?: string;   // tmux session name (present if tmux is enabled)
  copyFiles?: string;
  postCheckout?: string; // Single command, consumer should use perRepoPostCheckout || postCheckout
};

export type AddToWorkspaceResult = {
  repoName: string;
  worktreePath: string;
  postCheckoutRan: boolean;
  postCheckoutSuccess: boolean;
  tmuxPaneAdded: boolean;
};

/**
 * Use case for adding a single repo to an existing workspace.
 * Creates a worktree for an existing branch, copies config files,
 * saves base branch to workspace config, adds a tmux pane (if enabled),
 * and runs post-checkout (if configured).
 */
export class AddToWorkspaceUseCase {
  constructor(
    private worktree: WorktreeService,
    private workspaceConfig: WorkspaceConfigService,
    private repoConfig: RepoConfigService,
    private postCheckout: PostCheckoutService,
    private tmux: TmuxService
  ) {}

  async execute(params: AddToWorkspaceParams): Promise<AddToWorkspaceResult> {
    const repoName = path.basename(params.repoPath);
    const worktreeDest = path.join(params.workspacePath, repoName);

    // 1. Create worktree by checking out the existing branch
    await this.worktree.createWorktreeCheckout(params.repoPath, worktreeDest, params.branchName);

    // 2. Resolve and copy config files using repo-level overrides with global fallback
    const repoConf = this.repoConfig.load(params.repoPath);
    const resolvedCopyFiles = this.repoConfig.resolveCopyFiles(repoConf, params.copyFiles);
    this.worktree.copyConfigFilesToWorktree(params.repoPath, worktreeDest, resolvedCopyFiles);

    // 3. Save base branch to workspace config
    this.workspaceConfig.save(params.workspacePath, {
      baseBranches: { [repoName]: params.baseBranch },
    });

    // 4. Add tmux pane (if session name provided)
    let paneIndex: number | undefined;
    let tmuxPaneAdded = false;
    if (params.sessionName) {
      try {
        paneIndex = await this.tmux.addPane(params.sessionName, worktreeDest);
        tmuxPaneAdded = true;
      } catch {
        // Don't fail if tmux pane addition fails
      }
    }

    // 5. Run post-checkout command (if configured)
    const postCheckoutCommand = params.postCheckout;
    let postCheckoutRan = false;
    let postCheckoutSuccess = false;

    if (postCheckoutCommand) {
      postCheckoutRan = true;
      try {
        if (params.sessionName !== undefined && paneIndex !== undefined) {
          // tmux enabled: send keys to the pane
          await this.tmux.sendKeysToPane(params.sessionName, paneIndex, postCheckoutCommand);
        } else {
          // tmux disabled: run command directly in worktree directory
          await this.postCheckout.runCommandInDirectory(worktreeDest, postCheckoutCommand);
        }
        postCheckoutSuccess = true;
      } catch {
        // Post-checkout failure is non-fatal; reported via postCheckoutSuccess: false
      }
    }

    return {
      repoName,
      worktreePath: worktreeDest,
      postCheckoutRan,
      postCheckoutSuccess,
      tmuxPaneAdded,
    };
  }
}
