import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { PostCheckoutService } from '../lib/postCheckout.js';
import type { TmuxService } from '../lib/tmux.js';

export type RunPostCheckoutParams = {
  workspacePath: string;
  sessionName?: string;
  tmuxEnabled: boolean;
  postCheckout?: string;
  perRepoPostCheckout?: Record<string, string>;
};

export type RunPostCheckoutResult = {
  successCount: number;
  totalCount: number;
};

/**
 * Use case for running post-checkout commands.
 * Runs commands either directly in worktree directories or in tmux panes.
 */
export class RunPostCheckoutUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private postCheckout: PostCheckoutService,
    private tmux: TmuxService
  ) {}

  async execute(params: RunPostCheckoutParams): Promise<RunPostCheckoutResult | undefined> {
    // Skip if no commands configured
    if (!params.postCheckout && (!params.perRepoPostCheckout || Object.keys(params.perRepoPostCheckout).length === 0)) {
      return undefined;
    }

    // Get worktree directories
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    // Map each worktree to its command (per-repo overrides global)
    const commandsToRun = worktreeDirs
      .map((dir, index) => {
        const repoName = path.basename(dir);
        const command = params.perRepoPostCheckout?.[repoName] ?? params.postCheckout;
        return command ? { dir, command, paneIndex: index + 1 } : null;
      })
      .filter((x): x is { dir: string; command: string; paneIndex: number } => x !== null);

    // Run commands in parallel
    let successCount = 0;
    await Promise.allSettled(
      commandsToRun.map(async ({ dir, command, paneIndex }) => {
        try {
          if (params.tmuxEnabled && params.sessionName) {
            // Panes are indexed from 0, first pane (root) is 0, worktrees start at 1
            await this.tmux.sendKeysToPane(params.sessionName, paneIndex, command);
          } else {
            await this.postCheckout.runCommandInDirectory(dir, command);
          }
          successCount++;
        } catch {
          // Error handled by counting successes
        }
      })
    );

    return { successCount, totalCount: commandsToRun.length };
  }
}
