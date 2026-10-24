import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorktreeService } from '../lib/worktree.js';
import type { RepoService } from '../lib/repos.js';
import type { StatusService } from '../lib/status.js';
import type { SessionManagers, SessionManagerKind } from '../lib/sessionManager.js';
import type { TrashService } from '../lib/trash.js';
import { WorkspaceHasIssuesError } from '../lib/errors.js';
import { StatusService as StatusServiceClass } from '../lib/status.js';

export type RemoveWorkspaceParams = {
  workspacePath: string;
  branchName: string;
  sourcePath: string;
  sessionManager: SessionManagerKind;
};

export type RemoveWorkspaceResult = {
  worktreesRemoved: number;
  worktreesTotal: number;
  workspaceDirRemoved: boolean;
  /** Where the workspace now sits until the background delete finishes */
  trashedPath: string;
  sessionClosed: boolean;
  issuesFound: Array<{ repoName: string; issue: string }>;
  removalErrors: Array<{ repo: string; error: string }>;
};

/**
 * Use case for removing a workspace with validation.
 * Checks for uncommitted changes before removal, then moves the workspace to
 * trash and deletes it in the background so large folders (node_modules) don't
 * block the caller.
 */
export class RemoveWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private worktree: WorktreeService,
    private repos: RepoService,
    private status: StatusService,
    private sessionManagers: SessionManagers,
    private trash: TrashService
  ) {}

  async execute(params: RemoveWorkspaceParams): Promise<RemoveWorkspaceResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);
    const issuesFound: Array<{ repoName: string; issue: string }> = [];

    // 1. Check status if worktrees exist
    if (worktreeDirs.length > 0) {
      const results = await this.status.checkAllWorktrees(worktreeDirs);

      for (const { repoName, status } of results) {
        if (StatusServiceClass.hasIssues(status)) {
          issuesFound.push({
            repoName,
            issue: StatusServiceClass.getStatusMessage(status),
          });
        }
      }

      if (issuesFound.length > 0) {
        throw new WorkspaceHasIssuesError(
          `${issuesFound.length} repo(s) have uncommitted changes or errors.`
        );
      }
    }

    // 2. Move workspace to trash (instant rename; throws before anything is changed)
    const allRepos = this.repos.discoverRepos(params.sourcePath);
    const trashedPath = this.trash.moveToTrash(params.workspacePath);

    // 3. Prune the now-missing worktrees from each source repo
    const removalErrors: Array<{ repo: string; error: string }> = [];
    let worktreesRemoved = 0;

    for (const worktreePath of worktreeDirs) {
      const repoName = path.basename(worktreePath);
      const sourceRepoPath = path.join(params.sourcePath, repoName);

      if (!allRepos.includes(sourceRepoPath)) {
        removalErrors.push({ repo: repoName, error: 'source repo not found' });
        continue;
      }

      try {
        await this.worktree.pruneWorktrees(sourceRepoPath);
        worktreesRemoved++;
      } catch (err: any) {
        removalErrors.push({ repo: repoName, error: err.stderr || err.message });
      }
    }

    // 4. Delete the trashed files without waiting
    this.trash.deleteInBackground(trashedPath);

    // 5. Close the workspace's session, if a session manager is configured
    let sessionClosed = false;
    const sessions = this.sessionManagers.get(params.sessionManager);
    if (sessions) {
      try {
        sessionClosed = await sessions.close(params.branchName);
      } catch {
        // Don't fail
      }
    }

    return {
      worktreesRemoved,
      worktreesTotal: worktreeDirs.length,
      workspaceDirRemoved: true,
      trashedPath,
      sessionClosed,
      issuesFound,
      removalErrors,
    };
  }
}
