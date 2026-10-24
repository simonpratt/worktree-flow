import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import { SessionExistsError, type SessionManager } from '../lib/sessionManager.js';

export type OpenSessionsParams = {
  sessions: SessionManager;
  workspaces: Array<{ path: string; sessionName: string }>;
};

export type OpenSessionsResult = {
  sessionsCreated: number;
  sessionsSkipped: number;
  errors: Array<{ workspace: string; error: string }>;
};

/**
 * Use case for opening sessions for the given workspaces, each with a terminal
 * per worktree (directories with .git). Skips workspaces whose session exists.
 */
export class OpenSessionsUseCase {
  constructor(private workspaceDir: WorkspaceDirectoryService) {}

  async execute(params: OpenSessionsParams): Promise<OpenSessionsResult> {
    let sessionsCreated = 0;
    let sessionsSkipped = 0;
    const errors: Array<{ workspace: string; error: string }> = [];

    for (const workspace of params.workspaces) {
      try {
        const panes = this.workspaceDir.getWorktreeDirs(workspace.path).map((path) => ({ path }));
        await params.sessions.create(workspace.sessionName, workspace.path, panes);
        sessionsCreated++;
      } catch (error: any) {
        if (error instanceof SessionExistsError) {
          sessionsSkipped++;
        } else {
          errors.push({ workspace: workspace.sessionName, error: error.message || 'Unknown error' });
        }
      }
    }

    return { sessionsCreated, sessionsSkipped, errors };
  }
}
