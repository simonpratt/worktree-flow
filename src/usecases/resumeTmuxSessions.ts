import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { TmuxService } from '../lib/tmux.js';
import type { RepoService } from '../lib/repos.js';
import type { ConfigService } from '../lib/config.js';

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
 * Only creates splits for directories that match repos from source-path.
 */
export class ResumeTmuxSessionsUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private tmux: TmuxService,
    private repos: RepoService,
    private config: ConfigService
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

    // 2. Get valid repo names from source-path
    const { sourcePath } = this.config.getRequired();
    const repoPaths = this.repos.discoverRepos(sourcePath);
    const validRepoNames = new Set(repoPaths.map(repoPath => path.basename(repoPath)));

    let sessionsCreated = 0;
    let sessionsSkipped = 0;
    const errors: Array<{ workspace: string; error: string }> = [];

    // 3. Try to create tmux session for each workspace
    for (const workspace of workspaces) {
      try {
        const allWorktreeDirs = this.workspaceDir.getWorktreeDirs(workspace.path);

        // Filter to only include directories that match repo names from source-path
        const filteredWorktreeDirs = allWorktreeDirs.filter(worktreeDir => {
          const dirName = path.basename(worktreeDir);
          return validRepoNames.has(dirName);
        });

        // Try to create session - will throw on duplicate session
        await this.tmux.createSession(workspace.path, workspace.name, filteredWorktreeDirs);
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
