import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { resolveWorkspace } from '../lib/workspace.js';

export async function runPush(branchName: string | undefined, services: Services): Promise<void> {
  const { workspacePath } = resolveWorkspace(branchName, services);

  const dirs = services.workspace.getWorktreeDirs(workspacePath);

  if (dirs.length === 0) {
    services.console.error('No repos found in workspace.');
    services.process.exit(1);
  }

  services.console.log(`Pushing ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);

  const successCount = await services.parallel.processInParallel(
    dirs,
    (dir) => path.basename(dir),
    async (dir) => services.git.pushWithRetry(dir)
  );

  services.console.log(`\n${successCount}/${dirs.length} repos pushed successfully.`);
}

export function registerPushCommand(program: Command): void {
  program
    .command('push [branch-name]')
    .description('Push all repos in a workspace (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();

      try {
        await runPush(branchName, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
