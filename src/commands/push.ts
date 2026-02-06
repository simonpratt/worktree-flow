import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import { NotInWorkspaceError } from '../lib/errors.js';

export function registerPushCommand(program: Command): void {
  program
    .command('push')
    .description('Push all repos in the current workspace')
    .action(async () => {
      const services = createServices();

      try {
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

        services.console.log(`Pushing ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);

        const successCount = await services.parallel.processInParallel(
          dirs,
          (dir) => path.basename(dir),
          async (dir) => {
            try {
              await services.git.push(dir);
              return 'pushed';
            } catch (err: any) {
              // Retry with --set-upstream if no upstream configured
              const stderr = err.stderr || err.message || '';
              if (stderr.includes('no upstream') || stderr.includes('has no upstream')) {
                const branch = await services.git.getCurrentBranch(dir);
                await services.git.pushSetUpstream(dir, branch);
                return 'pushed (set upstream)';
              }
              throw err;
            }
          }
        );

        services.console.log(`\n${successCount}/${dirs.length} repos pushed successfully.`);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
