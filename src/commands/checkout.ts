import { Command } from 'commander';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import { RepoService } from '../lib/repos.js';
import { NoReposFoundError } from '../lib/errors.js';

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        const { sourcePath, destPath } = services.config.getRequired();
        const config = services.config.load();
        const repos = services.repos.discoverRepos(sourcePath);

        if (repos.length === 0) {
          throw new NoReposFoundError(sourcePath);
        }

        // Fetch all repos first
        await services.fetch.fetchRepos(repos);

        // Check which repos have the branch (using local remote-tracking branches after fetch)
        services.console.log('\nChecking for branch...');
        const matchingRepos: string[] = [];
        for (const repoPath of repos) {
          const repoName = RepoService.getRepoName(repoPath);
          try {
            if (await services.git.localRemoteBranchExists(repoPath, branchName)) {
              services.console.log(`${repoName}... ${chalk.green('found')}`);
              matchingRepos.push(repoPath);
            } else {
              services.console.log(`${repoName}... ${chalk.dim('no branch')}`);
            }
          } catch (err: any) {
            services.console.log(`${repoName}... ${chalk.red(`error: ${err.stderr || err.message}`)}`);
          }
        }

        if (matchingRepos.length === 0) {
          services.console.error(`\nBranch "${branchName}" not found in any repo.`);
          services.process.exit(1);
        }

        services.console.log(
          `\nFound "${branchName}" in ${matchingRepos.length} repo(s). Creating worktrees...`
        );

        const workspacePath = services.workspace.createWorkspaceDir(destPath, branchName);

        const successCount = await services.parallel.processInParallel(
          matchingRepos,
          (repoPath) => RepoService.getRepoName(repoPath),
          async (repoPath, name) => {
            const worktreeDest = path.join(workspacePath, name);
            await services.git.addWorktree(repoPath, worktreeDest, branchName);
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
          `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${matchingRepos.length} repos.`
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
