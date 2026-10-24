import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { PostCheckoutService } from '../lib/postCheckout.js';
import type {
  PaneCommandResult,
  SessionManagerKind,
  SessionManagers,
  SessionPane,
} from '../lib/sessionManager.js';

export type OpenWorkspaceSessionParams = {
  sessionManager: SessionManagerKind;
  workspacePath: string;
  /** The workspace's branch name */
  sessionName: string;
  /** Worktrees just added to the workspace, with their post-checkout command (if any) */
  panes: SessionPane[];
};

export type OpenWorkspaceSessionResult = {
  /**
   * created: a new session holding every worktree in the workspace;
   * extended: panes added to the existing session;
   * none: no session manager configured;
   * failed: the session manager errored, so commands ran directly instead
   */
  session: 'created' | 'extended' | 'none' | 'failed';
  sessionError?: string;
  postCheckout: PaneCommandResult[];
};

/**
 * Use case for giving newly added worktrees a terminal and running their
 * post-checkout commands. With a session manager, commands run in the session's
 * panes so their output is visible; otherwise (or if the session manager fails)
 * they run directly in each worktree.
 */
export class OpenWorkspaceSessionUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private postCheckout: PostCheckoutService,
    private sessionManagers: SessionManagers
  ) {}

  async execute(params: OpenWorkspaceSessionParams): Promise<OpenWorkspaceSessionResult> {
    const sessions = this.sessionManagers.get(params.sessionManager);
    let sessionError: string | undefined;

    if (sessions) {
      try {
        if (await sessions.exists(params.sessionName)) {
          const postCheckout = await sessions.addPanes(params.sessionName, params.panes);
          return { session: 'extended', postCheckout };
        }

        // A new session covers every worktree in the workspace, not just the new ones
        const commands = new Map(params.panes.map((p) => [p.path, p.command]));
        const allPanes = this.workspaceDir
          .getWorktreeDirs(params.workspacePath)
          .map((path) => ({ path, command: commands.get(path) }));

        const postCheckout = await sessions.create(params.sessionName, params.workspacePath, allPanes);
        return { session: 'created', postCheckout };
      } catch (error: any) {
        sessionError = error.message || 'Unknown error';
      }
    }

    const postCheckout = await Promise.all(
      params.panes
        .filter((pane): pane is Required<SessionPane> => !!pane.command)
        .map(async ({ path, command }) => {
          try {
            await this.postCheckout.runCommandInDirectory(path, command);
            return { path, success: true };
          } catch {
            return { path, success: false };
          }
        })
    );

    return { session: sessions ? 'failed' : 'none', sessionError, postCheckout };
  }
}
