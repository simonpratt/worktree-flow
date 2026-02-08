import path from 'node:path';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { GitService } from '../lib/git.js';
import type { ParallelService } from '../lib/parallel.js';

export type PushWorkspaceParams = {
  workspacePath: string;
};

export type PushWorkspaceResult = {
  successCount: number;
  totalCount: number;
};

/**
 * Use case for pushing all worktrees in a workspace.
 */
export class PushWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private git: GitService,
    private parallel: ParallelService
  ) {}

  async execute(params: PushWorkspaceParams): Promise<PushWorkspaceResult> {
    const worktreeDirs = this.workspaceDir.getWorktreeDirs(params.workspacePath);

    const successCount = await this.parallel.processInParallel(
      worktreeDirs,
      (worktreePath) => path.basename(worktreePath),
      async (worktreePath) => {
        return await this.git.pushWithRetry(worktreePath);
      }
    );

    return {
      successCount,
      totalCount: worktreeDirs.length,
    };
  }
}
