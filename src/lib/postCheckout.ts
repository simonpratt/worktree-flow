import type { IShell } from '../adapters/types.js';

/**
 * PostCheckoutService handles execution of post-checkout commands.
 */
export class PostCheckoutService {
  constructor(private shell: IShell) {}

  async runCommand(
    worktreeDirs: string[],
    command: string
  ): Promise<{ successCount: number; totalCount: number }> {
    let successCount = 0;

    await Promise.allSettled(
      worktreeDirs.map(async (worktreeDir) => {
        try {
          await this.shell.execFile('sh', ['-c', command], { cwd: worktreeDir });
          successCount++;
        } catch {
          // Error handled by caller
        }
      })
    );

    return { successCount, totalCount: worktreeDirs.length };
  }
}
