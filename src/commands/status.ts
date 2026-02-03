import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { getRequiredConfig, loadConfig } from '../lib/config.js';
import { getRepoName } from '../lib/repos.js';
import { getWorktreeDirs } from '../lib/workspace.js';
import { getWorktreeStatus, getStatusMessage, hasIssues } from '../lib/status.js';
import { fetchRepos } from '../lib/fetch.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <branch-name>')
    .description('Show status of all worktrees in a workspace')
    .action(async (branchName: string) => {
      const { destPath } = getRequiredConfig();
      const config = loadConfig();
      const workspacePath = path.join(destPath, branchName);

      // Check if workspace exists
      if (!fs.existsSync(workspacePath)) {
        console.error(`Workspace does not exist: ${workspacePath}`);
        process.exit(1);
      }

      console.log(`Workspace: ${chalk.cyan(workspacePath)}`);

      // Get all worktree directories
      const worktreeDirs = getWorktreeDirs(workspacePath);

      if (worktreeDirs.length === 0) {
        console.log('\nNo worktrees found in workspace.');
        return;
      }

      // Fetch all repos to get latest remote state
      console.log();
      await fetchRepos(worktreeDirs);

      console.log(`\nStatus (comparing against ${chalk.cyan(config.mainBranch)}):\n`);

      let cleanCount = 0;
      let issuesCount = 0;

      for (const worktreePath of worktreeDirs) {
        const repoName = getRepoName(worktreePath);
        const status = await getWorktreeStatus(worktreePath, config.mainBranch);
        const message = getStatusMessage(status, config.mainBranch);

        if (hasIssues(status)) {
          console.log(`  ${chalk.red('✗')} ${repoName}: ${chalk.red(message)}`);
          issuesCount++;
        } else {
          console.log(`  ${chalk.green('✓')} ${repoName}: ${chalk.green(message)}`);
          cleanCount++;
        }
      }

      console.log();
      console.log(`Summary: ${chalk.green(`${cleanCount} up to date`)}, ${issuesCount > 0 ? chalk.red(`${issuesCount} with issues`) : chalk.green('0 with issues')}`);
    });
}
