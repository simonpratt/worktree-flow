import path from 'node:path';
import type { WorkspaceDirectoryService } from './workspaceDirectory.js';

export type WorkspaceReposCollection = {
  uniqueSourceRepos: string[];
  workspaceWorktrees: Map<string, string[]>;
};

/**
 * Collects all worktree directories and unique source repos across workspaces.
 * This helper extracts common logic used by multiple use cases that need to
 * fetch repos before analyzing workspace status.
 */
export function collectWorkspaceRepos(
  workspaces: Array<{ name: string; path: string; repoCount: number }>,
  workspaceDir: WorkspaceDirectoryService,
  sourcePath: string
): WorkspaceReposCollection {
  const uniqueSourceRepos = new Set<string>();
  const workspaceWorktrees = new Map<string, string[]>();

  for (const workspace of workspaces) {
    const worktreeDirs = workspaceDir.getWorktreeDirs(workspace.path);
    if (worktreeDirs.length > 0) {
      workspaceWorktrees.set(workspace.path, worktreeDirs);
      // Extract repo names and build source repo paths
      worktreeDirs.forEach((worktreePath) => {
        const repoName = path.basename(worktreePath);
        const sourceRepoPath = path.join(sourcePath, repoName);
        uniqueSourceRepos.add(sourceRepoPath);
      });
    }
  }

  return {
    uniqueSourceRepos: Array.from(uniqueSourceRepos),
    workspaceWorktrees,
  };
}
