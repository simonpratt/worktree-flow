import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import { RepoService } from '../lib/repos.js';
import { StatusService } from '../lib/status.js';
import { WorkspaceNotFoundError, WorkspaceHasIssuesError } from '../lib/errors.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <branch-name>')
    .description('Remove a workspace and all its worktrees')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        const { sourcePath, destPath } = services.config.getRequired();
        const config = services.config.load();
        const workspacePath = path.join(destPath, branchName);

        // Check if workspace exists
        const workspaces = services.workspace.listWorkspaces(destPath);
        const workspace = workspaces.find(ws => ws.name === branchName);

        if (!workspace) {
          throw new WorkspaceNotFoundError(workspacePath);
        }

        services.console.log(`Checking workspace: ${chalk.cyan(workspacePath)}`);

        // Get all worktree directories
        const worktreeDirs = services.workspace.getWorktreeDirs(workspacePath);

        if (worktreeDirs.length === 0) {
          services.console.log('No worktrees found in workspace.');
        } else {
          // Fetch all repos to get latest remote state
          await services.fetch.fetchRepos(worktreeDirs);

          // Check for uncommitted changes and changes ahead of main in all worktrees
          services.console.log(`\nChecking for uncommitted changes and commits ahead of ${config.mainBranch}...`);
          const reposWithIssues: string[] = [];

          for (const worktreePath of worktreeDirs) {
            const repoName = RepoService.getRepoName(worktreePath);
            const status = await services.status.getWorktreeStatus(worktreePath, config.mainBranch);
            const message = StatusService.getStatusMessage(status, config.mainBranch);

            if (StatusService.hasIssues(status)) {
              services.console.log(`${repoName}... ${chalk.red(message)}`);
              reposWithIssues.push(repoName);
            } else {
              services.console.log(`${repoName}... ${chalk.green(message)}`);
            }
          }

          // Abort if any worktrees have issues
          if (reposWithIssues.length > 0) {
            throw new WorkspaceHasIssuesError(
              `${reposWithIssues.length} repo(s) have uncommitted or unmerged changes.\nPlease commit and merge your changes first.`
            );
          }
        }

        // Show what will be removed and ask for confirmation
        services.console.log(`\n${chalk.yellow('This will remove:')}`);
        services.console.log(`  Directory: ${chalk.cyan(workspacePath)}`);
        if (worktreeDirs.length > 0) {
          services.console.log(`  Worktrees: ${worktreeDirs.length} repo(s)`);
        }
        if (config.tmux) {
          services.console.log(`  Tmux session: ${chalk.cyan(branchName)}`);
        }

        const confirmed = await confirm({
          message: 'Are you sure you want to remove this workspace?',
          default: false,
        });

        if (!confirmed) {
          services.console.log('\nCancelled.');
          services.process.exit(0);
        }

        if (worktreeDirs.length > 0) {
          // Remove all worktrees
          services.console.log('\nRemoving worktrees...');
          let successCount = 0;

          for (const worktreePath of worktreeDirs) {
            const repoName = RepoService.getRepoName(worktreePath);
            const sourceRepoPath = path.join(sourcePath, repoName);

            try {
              // Check if source repo exists
              const repos = services.repos.discoverRepos(sourcePath);
              if (!repos.includes(sourceRepoPath)) {
                services.console.log(
                  `${repoName}... ${chalk.yellow('source repo not found, skipping worktree removal')}`
                );
                continue;
              }

              await services.git.removeWorktree(sourceRepoPath, worktreePath);
              services.console.log(`${repoName}... ${chalk.green('removed')}`);
              successCount++;
            } catch (err: any) {
              services.console.log(`${repoName}... ${chalk.red(`error: ${err.stderr || err.message}`)}`);
            }
          }

          services.console.log(`\nRemoved ${successCount}/${worktreeDirs.length} worktree(s).`);
        }

        // Remove workspace directory
        services.console.log('\nRemoving workspace directory...');
        try {
          services.workspace.removeWorkspaceDir(workspacePath);
          services.console.log(`${chalk.green('Removed:')} ${workspacePath}`);
        } catch (err: any) {
          services.console.error(`${chalk.red('Failed to remove directory:')} ${err.message}`);
          services.process.exit(1);
        }

        // Kill tmux session if enabled
        if (config.tmux) {
          services.console.log('\nKilling tmux session...');
          try {
            await services.tmux.killSession(branchName);
            services.console.log(`${chalk.green('Killed tmux session:')} ${branchName}`);
          } catch (error: any) {
            services.console.error(chalk.yellow(`Warning: Failed to kill tmux session: ${error.message}`));
          }
        }

        services.console.log(`\n${chalk.green('Successfully removed workspace:')} ${branchName}`);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
