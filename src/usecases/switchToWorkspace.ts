import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { SessionManager } from '../lib/sessionManager.js';

export type SwitchToWorkspaceParams = {
  sessions: SessionManager;
  workspacePath: string;
  /** The workspace's branch name, which names its session */
  sessionName: string;
};

export type SwitchToWorkspaceResult = {
  /** Whether the session had to be created first */
  created: boolean;
};

/**
 * Use case for switching to a workspace's session, first creating it (with a
 * terminal per worktree, and no post-checkout) if it doesn't exist.
 */
export class SwitchToWorkspaceUseCase {
  constructor(private workspaceDir: WorkspaceDirectoryService) {}

  async execute(params: SwitchToWorkspaceParams): Promise<SwitchToWorkspaceResult> {
    const { sessions, workspacePath, sessionName } = params;
    let created = false;

    if (!(await sessions.exists(sessionName))) {
      const panes = this.workspaceDir.getWorktreeDirs(workspacePath).map((path) => ({ path }));
      await sessions.create(sessionName, workspacePath, panes);
      created = true;
    }

    await sessions.focus(sessionName);
    return { created };
  }
}
