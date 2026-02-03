import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig, loadConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { discoverRepos, getRepoName } from '../lib/repos.js';
import { createWorkspaceDir, copyAgentsMd, copyConfigFilesToWorktree } from '../lib/workspace.js';
import { createTmuxSession } from '../lib/tmux.js';
import { processInParallel } from '../lib/parallel.js';
import { fetchRepos } from '../lib/fetch.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description('Create branches and worktrees for selected repos')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const config = loadConfig();
      const repos = discoverRepos(sourcePath);

      if (repos.length === 0) {
        console.error(`No git repositories found in ${sourcePath}`);
        process.exit(1);
      }

      const selected = await checkbox({
        message: `Select repos for branch "${branchName}":`,
        choices: repos
          .map(repoPath => ({
            name: getRepoName(repoPath),
            value: repoPath,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        pageSize: 20,
      });

      if (selected.length === 0) {
        console.log('No repos selected.');
        return;
      }

      // Ask user which branch to branch from
      const sourceBranch = await input({
        message: 'Branch from which branch?',
        default: 'master',
      });

      // Fetch all selected repos first
      await fetchRepos(selected);

      console.log('\nCreating worktrees...');
      const workspacePath = createWorkspaceDir(destPath, branchName);

      const successCount = await processInParallel(
        selected,
        (repoPath) => getRepoName(repoPath),
        async (repoPath, name) => {
          const worktreeDest = path.join(workspacePath, name);
          await git.addWorktreeNewBranch(repoPath, worktreeDest, branchName, sourceBranch);
          copyConfigFilesToWorktree(repoPath, worktreeDest, config.copyFiles);
          return 'created';
        }
      );

      copyAgentsMd(sourcePath, workspacePath);

      // Create tmux session if enabled
      if (config.tmux) {
        try {
          await createTmuxSession(workspacePath, branchName);
          console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
        } catch (error: any) {
          console.error(chalk.yellow(`Warning: Failed to create tmux session: ${error.message}`));
        }
      }

      console.log(
        `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${selected.length} repos.`
      );
    });
}
