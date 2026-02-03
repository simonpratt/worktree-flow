import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import confirm from '@inquirer/confirm';
import { getRequiredConfig, loadConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { getRepoName } from '../lib/repos.js';
import { getWorktreeDirs } from '../lib/workspace.js';
import { killTmuxSession } from '../lib/tmux.js';
import { getWorktreeStatus, getStatusMessage, hasIssues } from '../lib/status.js';
import { fetchRepos } from '../lib/fetch.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <branch-name>')
    .description('Remove a workspace and all its worktrees')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const config = loadConfig();
      const workspacePath = path.join(destPath, branchName);

      // Check if workspace exists
      if (!fs.existsSync(workspacePath)) {
        console.error(`Workspace does not exist: ${workspacePath}`);
        process.exit(1);
      }

      console.log(`Checking workspace: ${chalk.cyan(workspacePath)}`);

      // Get all worktree directories
      const worktreeDirs = getWorktreeDirs(workspacePath);

      if (worktreeDirs.length === 0) {
        console.log('No worktrees found in workspace.');
      } else {
        // Fetch all repos to get latest remote state
        await fetchRepos(worktreeDirs);

        // Check for uncommitted changes and changes ahead of main in all worktrees
        console.log(`\nChecking for uncommitted changes and commits ahead of ${config.mainBranch}...`);
        const reposWithIssues: string[] = [];

        for (const worktreePath of worktreeDirs) {
          const repoName = getRepoName(worktreePath);
          const status = await getWorktreeStatus(worktreePath, config.mainBranch);
          const message = getStatusMessage(status, config.mainBranch);

          if (hasIssues(status)) {
            console.log(`${repoName}... ${chalk.red(message)}`);
            reposWithIssues.push(repoName);
          } else {
            console.log(`${repoName}... ${chalk.green(message)}`);
          }
        }

        // Abort if any worktrees have issues
        if (reposWithIssues.length > 0) {
          console.error(
            `\n${chalk.red('Cannot remove workspace:')} ${reposWithIssues.length} repo(s) have uncommitted or unmerged changes.`
          );
          console.error('Please commit and merge your changes first.');
          process.exit(1);
        }
      }

      // Show what will be removed and ask for confirmation
      console.log(`\n${chalk.yellow('This will remove:')}`);
      console.log(`  Directory: ${chalk.cyan(workspacePath)}`);
      if (worktreeDirs.length > 0) {
        console.log(`  Worktrees: ${worktreeDirs.length} repo(s)`);
      }
      if (config.tmux) {
        console.log(`  Tmux session: ${chalk.cyan(branchName)}`);
      }

      const confirmed = await confirm({
        message: 'Are you sure you want to remove this workspace?',
        default: false,
      });

      if (!confirmed) {
        console.log('\nCancelled.');
        process.exit(0);
      }

      if (worktreeDirs.length > 0) {
        // Remove all worktrees
        console.log('\nRemoving worktrees...');
        let successCount = 0;

        for (const worktreePath of worktreeDirs) {
          const repoName = getRepoName(worktreePath);
          const sourceRepoPath = path.join(sourcePath, repoName);

          try {
            // Check if source repo exists
            if (!fs.existsSync(sourceRepoPath)) {
              console.log(
                `${repoName}... ${chalk.yellow('source repo not found, skipping worktree removal')}`
              );
              continue;
            }

            await git.removeWorktree(sourceRepoPath, worktreePath);
            console.log(`${repoName}... ${chalk.green('removed')}`);
            successCount++;
          } catch (err: any) {
            console.log(`${repoName}... ${chalk.red(`error: ${err.stderr || err.message}`)}`);
          }
        }

        console.log(`\nRemoved ${successCount}/${worktreeDirs.length} worktree(s).`);
      }

      // Remove workspace directory
      console.log('\nRemoving workspace directory...');
      try {
        fs.rmSync(workspacePath, { recursive: true, force: true });
        console.log(`${chalk.green('Removed:')} ${workspacePath}`);
      } catch (err: any) {
        console.error(`${chalk.red('Failed to remove directory:')} ${err.message}`);
        process.exit(1);
      }

      // Kill tmux session if enabled
      if (config.tmux) {
        console.log('\nKilling tmux session...');
        try {
          await killTmuxSession(branchName);
          console.log(`${chalk.green('Killed tmux session:')} ${branchName}`);
        } catch (error: any) {
          console.error(chalk.yellow(`Warning: Failed to kill tmux session: ${error.message}`));
        }
      }

      console.log(`\n${chalk.green('Successfully removed workspace:')} ${branchName}`);
    });
}
