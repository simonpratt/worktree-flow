import path from 'node:path';
import type { IShell } from '../adapters/types.js';

/**
 * PostCheckoutService handles execution of post-checkout commands.
 */
export class PostCheckoutService {
  constructor(private shell: IShell) {}

  async runCommand(
    worktreeDirs: string[],
    globalCommand: string | undefined,
    perRepoCommands: Record<string, string>
  ): Promise<{ successCount: number; totalCount: number }> {
    // Determine command for each worktree (per-repo overrides global)
    const commandsToRun = worktreeDirs
      .map((dir) => {
        const repoName = path.basename(dir);
        const command = perRepoCommands[repoName] ?? globalCommand;
        return command ? { dir, command } : null;
      })
      .filter((x): x is { dir: string; command: string } => x !== null);

    let successCount = 0;
    await Promise.allSettled(
      commandsToRun.map(async ({ dir, command }) => {
        try {
          await this.shell.execFile('sh', ['-c', command], { cwd: dir });
          successCount++;
        } catch {
          // Error handled by caller
        }
      })
    );

    return { successCount, totalCount: commandsToRun.length };
  }
}
