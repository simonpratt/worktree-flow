import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { GitService } from '../lib/git.js';
import type { ParallelService } from '../lib/parallel.js';

export type PullWorkspaceParams = {
  workspacePath: string;
};

export type PullWorkspaceResult = {
  successCount: number;
  totalCount: number;
};

/**
 * Use case for pulling all worktrees in a workspace.
 */
export class PullWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private git: GitService,
    private parallel: ParallelService
  ) {}

  async execute(params: PullWorkspaceParams): Promise<PullWorkspaceResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    const successCount = await this.parallel.processInParallel(
      worktreeDirs,
      (worktreePath) => path.basename(worktreePath),
      async (worktreePath) => {
        await this.git.pull(worktreePath);
        return 'pulled';
      }
    );

    return {
      successCount,
      totalCount: worktreeDirs.length,
    };
  }
}
