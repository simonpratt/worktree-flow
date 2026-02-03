import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { detectWorkspace, getWorktreeDirs } from '../lib/workspace.js';
import { processInParallel } from '../lib/parallel.js';

export function registerPushCommand(program: Command): void {
  program
    .command('push')
    .description('Push all repos in the current workspace')
    .action(async () => {
      const { destPath } = getRequiredConfig();
      const workspacePath = detectWorkspace(process.cwd(), destPath);

      if (!workspacePath) {
        console.error(
          `Not inside a flow workspace.\nNavigate to a directory under ${destPath}/.`
        );
        process.exit(1);
      }

      const dirs = getWorktreeDirs(workspacePath);

      if (dirs.length === 0) {
        console.error('No repos found in workspace.');
        process.exit(1);
      }

      console.log(`Pushing ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);

      const successCount = await processInParallel(
        dirs,
        (dir) => path.basename(dir),
        async (dir) => {
          try {
            await git.push(dir);
            return 'pushed';
          } catch (err: any) {
            // Retry with --set-upstream if no upstream configured
            const stderr = err.stderr || err.message || '';
            if (stderr.includes('no upstream') || stderr.includes('has no upstream')) {
              const branch = await git.getCurrentBranch(dir);
              await git.pushSetUpstream(dir, branch);
              return 'pushed (set upstream)';
            }
            throw err;
          }
        }
      );

      console.log(`\n${successCount}/${dirs.length} repos pushed successfully.`);
    });
}
