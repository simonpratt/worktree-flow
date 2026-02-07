import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { NotInWorkspaceError } from '../lib/errors.js';

export async function runPull(services: Services): Promise<void> {
  const { destPath } = services.config.getRequired();
  const workspacePath = services.workspace.detectWorkspace(services.process.cwd(), destPath);

  if (!workspacePath) {
    throw new NotInWorkspaceError(destPath);
  }

  const dirs = services.workspace.getWorktreeDirs(workspacePath);

  if (dirs.length === 0) {
    services.console.error('No repos found in workspace.');
    services.process.exit(1);
  }

  services.console.log(`Pulling ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);

  const successCount = await services.parallel.processInParallel(
    dirs,
    (dir) => path.basename(dir),
    async (dir) => {
      await services.git.pull(dir);
      return 'pulled';
    }
  );

  services.console.log(`\n${successCount}/${dirs.length} repos pulled successfully.`);
}

export function registerPullCommand(program: Command): void {
  program
    .command('pull')
    .description('Pull all repos in the current workspace')
    .action(async () => {
      const services = createServices();

      try {
        await runPull(services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
