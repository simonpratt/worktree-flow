import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { detectWorkspace, getWorktreeDirs } from '../lib/workspace.js';

export function registerPullCommand(program: Command): void {
  program
    .command('pull')
    .description('Pull all repos in the current workspace')
    .action(() => {
      const { destPath } = getRequiredConfig();
      const workspacePath = detectWorkspace(process.cwd(), destPath);

      if (!workspacePath) {
        console.error(
          `Not inside a flowtree workspace.\nNavigate to a directory under ${destPath}/.`
        );
        process.exit(1);
      }

      const dirs = getWorktreeDirs(workspacePath);

      if (dirs.length === 0) {
        console.error('No repos found in workspace.');
        process.exit(1);
      }

      console.log(`Pulling ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);
      let successCount = 0;

      for (const dir of dirs) {
        const repoName = path.basename(dir);
        try {
          git.pull(dir);
          console.log(chalk.green(`  ${repoName}: pulled`));
          successCount++;
        } catch (err: any) {
          console.error(chalk.red(`  ${repoName}: ${err.stderr || err.message}`));
        }
      }

      console.log(`\n${successCount}/${dirs.length} repos pulled successfully.`);
    });
}
