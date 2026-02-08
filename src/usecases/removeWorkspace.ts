import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorktreeService } from '../lib/worktree.js';
import type { RepoService } from '../lib/repos.js';
import type { FetchService } from '../lib/fetch.js';
import type { StatusService } from '../lib/status.js';
import type { TmuxService } from '../lib/tmux.js';
import { WorkspaceHasIssuesError } from '../lib/errors.js';
import { StatusService as StatusServiceClass } from '../lib/status.js';

export type RemoveWorkspaceParams = {
  workspacePath: string;
  branchName: string;
  sourcePath: string;
  mainBranch: string;
  tmux: boolean;
};

export type RemoveWorkspaceResult = {
  worktreesRemoved: number;
  worktreesTotal: number;
  workspaceDirRemoved: boolean;
  tmuxKilled: boolean;
  issuesFound: Array<{ repoName: string; issue: string }>;
  removalErrors: Array<{ repo: string; error: string }>;
};

/**
 * Use case for removing a workspace with validation.
 * Checks for uncommitted changes before removal.
 */
export class RemoveWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private worktree: WorktreeService,
    private repos: RepoService,
    private fetch: FetchService,
    private status: StatusService,
    private tmux: TmuxService
  ) {}

  async execute(params: RemoveWorkspaceParams): Promise<RemoveWorkspaceResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);
    const issuesFound: Array<{ repoName: string; issue: string }> = [];

    // 1. Fetch and check status if worktrees exist
    if (worktreeDirs.length > 0) {
      await this.fetch.fetchRepos(worktreeDirs);

      const results = await this.status.checkAllWorktrees(
        worktreeDirs,
        params.mainBranch
      );

      for (const { repoName, status } of results) {
        if (StatusServiceClass.hasIssues(status)) {
          issuesFound.push({
            repoName,
            issue: StatusServiceClass.getStatusMessage(status, params.mainBranch),
          });
        }
      }

      if (issuesFound.length > 0) {
        throw new WorkspaceHasIssuesError(
          `${issuesFound.length} repo(s) have uncommitted or unmerged changes.`
        );
      }
    }

    // 2. Remove all worktrees
    const removalErrors: Array<{ repo: string; error: string }> = [];
    let worktreesRemoved = 0;

    for (const worktreePath of worktreeDirs) {
      const repoName = path.basename(worktreePath);
      const sourceRepoPath = path.join(params.sourcePath, repoName);

      try {
        const allRepos = this.repos.discoverRepos(params.sourcePath);
        if (!allRepos.includes(sourceRepoPath)) {
          removalErrors.push({ repo: repoName, error: 'source repo not found' });
          continue;
        }

        await this.worktree.removeWorktree(sourceRepoPath, worktreePath);
        worktreesRemoved++;
      } catch (err: any) {
        removalErrors.push({ repo: repoName, error: err.stderr || err.message });
      }
    }

    // 3. Remove workspace directory
    let workspaceDirRemoved = false;
    try {
      this.workspaceDir.removeWorkspaceDir(params.workspacePath);
      workspaceDirRemoved = true;
    } catch (err) {
      throw err; // Re-throw directory removal errors
    }

    // 4. Kill tmux session if enabled
    let tmuxKilled = false;
    if (params.tmux) {
      try {
        await this.tmux.killSession(params.branchName);
        tmuxKilled = true;
      } catch (error) {
        // Don't fail
      }
    }

    return {
      worktreesRemoved,
      worktreesTotal: worktreeDirs.length,
      workspaceDirRemoved,
      tmuxKilled,
      issuesFound,
      removalErrors,
    };
  }
}
