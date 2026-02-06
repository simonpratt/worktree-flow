import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import { RepoService } from '../lib/repos.js';
import { NoReposFoundError } from '../lib/errors.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description('Create branches and worktrees for selected repos')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        const { sourcePath, destPath } = services.config.getRequired();
        const config = services.config.load();
        const repos = services.repos.discoverRepos(sourcePath);

        if (repos.length === 0) {
          throw new NoReposFoundError(sourcePath);
        }

        const selected = await checkbox({
          message: `Select repos for branch "${branchName}":`,
          choices: repos
            .map(repoPath => ({
              name: RepoService.getRepoName(repoPath),
              value: repoPath,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          pageSize: 20,
        });

        if (selected.length === 0) {
          services.console.log('No repos selected.');
          return;
        }

        // Ask user which branch to branch from
        const sourceBranch = await input({
          message: 'Branch from which branch?',
          default: 'master',
        });

        // Fetch all selected repos first
        await services.fetch.fetchRepos(selected);

        services.console.log('\nCreating worktrees...');
        const workspacePath = services.workspace.createWorkspaceDir(destPath, branchName);

        const successCount = await services.parallel.processInParallel(
          selected,
          (repoPath) => RepoService.getRepoName(repoPath),
          async (repoPath, name) => {
            const worktreeDest = path.join(workspacePath, name);
            await services.git.addWorktreeNewBranch(repoPath, worktreeDest, branchName, sourceBranch);
            services.workspace.copyConfigFilesToWorktree(repoPath, worktreeDest, config.copyFiles);
            return 'created';
          }
        );

        services.workspace.copyAgentsMd(sourcePath, workspacePath);

        // Create tmux session if enabled
        if (config.tmux) {
          try {
            await services.tmux.createSession(workspacePath, branchName);
            services.console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
          } catch (error: any) {
            services.console.error(chalk.yellow(`Warning: Failed to create tmux session: ${error.message}`));
          }
        }

        services.console.log(
          `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${selected.length} repos.`
        );

        // Ask if user wants to run post-checkout command
        if (config.postCheckout) {
          const shouldRun = await confirm({
            message: `Run "${config.postCheckout}" in all workspaces?`,
            default: true,
          });

          if (shouldRun) {
            const worktreeDirs = services.workspace.getWorktreeDirs(workspacePath);
            services.console.log(`\nRunning "${config.postCheckout}" in ${worktreeDirs.length} workspace(s)...`);
            const completedCount = await services.workspace.runPostCheckoutCommand(worktreeDirs, config.postCheckout);
            services.console.log(`\nCompleted in ${completedCount}/${worktreeDirs.length} workspace(s).`);
          }
        } else {
          services.console.log('\nTip: Configure a post-checkout command to run automatically after branching/checkout.');
          services.console.log('  Example: flow config set post-checkout "npm ci"');
        }
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
