import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { TmuxService } from '../lib/tmux.js';

export type ResumeTmuxSessionsParams = {
  destPath: string;
};

export type ResumeTmuxSessionsResult = {
  totalWorkspaces: number;
  sessionsCreated: number;
  sessionsSkipped: number;
  errors: Array<{ workspace: string; error: string }>;
};

/**
 * Use case for resuming tmux sessions across all workspaces.
 * Creates sessions for workspaces that don't already have one.
 * Creates splits for all git directories (directories with .git).
 */
export class ResumeTmuxSessionsUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private tmux: TmuxService
  ) {}

  async execute(params: ResumeTmuxSessionsParams): Promise<ResumeTmuxSessionsResult> {
    // 1. List all workspaces
    const workspaces = this.workspaceDir.listWorkspaces(params.destPath);

    // Early return if no workspaces
    if (workspaces.length === 0) {
      return {
        totalWorkspaces: 0,
        sessionsCreated: 0,
        sessionsSkipped: 0,
        errors: [],
      };
    }

    let sessionsCreated = 0;
    let sessionsSkipped = 0;
    const errors: Array<{ workspace: string; error: string }> = [];

    // 2. Try to create tmux session for each workspace
    for (const workspace of workspaces) {
      try {
        // Get all git directories (getWorktreeDirs now filters to only include dirs with .git)
        const worktreeDirs = this.workspaceDir.getWorktreeDirs(workspace.path);

        // Try to create session - will throw on duplicate session
        await this.tmux.createSession(workspace.path, workspace.name, worktreeDirs);
        sessionsCreated++;
      } catch (error: any) {
        // Check if session already exists
        if (error.message?.includes('duplicate session')) {
          sessionsSkipped++;
        } else {
          // Other error
          errors.push({
            workspace: workspace.name,
            error: error.message || 'Unknown error',
          });
        }
      }
    }

    return {
      totalWorkspaces: workspaces.length,
      sessionsCreated,
      sessionsSkipped,
      errors,
    };
  }
}
