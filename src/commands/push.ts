import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { detectWorkspace, getWorktreeDirs } from '../lib/workspace.js';

export function registerPushCommand(program: Command): void {
  program
    .command('push')
    .description('Push all repos in the current workspace')
    .action(() => {
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
      let successCount = 0;

      for (const dir of dirs) {
        const repoName = path.basename(dir);
        try {
          git.push(dir);
          console.log(chalk.green(`  ${repoName}: pushed`));
          successCount++;
        } catch (err: any) {
          // Retry with --set-upstream if no upstream configured
          const stderr = err.stderr || err.message || '';
          if (stderr.includes('no upstream') || stderr.includes('has no upstream')) {
            try {
              const branch = git.getCurrentBranch(dir);
              git.pushSetUpstream(dir, branch);
              console.log(chalk.green(`  ${repoName}: pushed (set upstream)`));
              successCount++;
            } catch (retryErr: any) {
              console.error(
                chalk.red(`  ${repoName}: ${retryErr.stderr || retryErr.message}`)
              );
            }
          } else {
            console.error(chalk.red(`  ${repoName}: ${stderr}`));
          }
        }
      }

      console.log(`\n${successCount}/${dirs.length} repos pushed successfully.`);
    });
}
