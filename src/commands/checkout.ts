import { Command } from 'commander';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { NoReposFoundError } from '../lib/errors.js';

export async function runCheckout(
  branchName: string,
  services: Services,
  deps: { confirm: (opts: { message: string; default: boolean }) => Promise<boolean> }
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();
  const repos = services.repos.discoverRepos(sourcePath);

  if (repos.length === 0) {
    throw new NoReposFoundError(sourcePath);
  }

  await services.fetch.fetchRepos(repos);

  services.console.log('\nChecking for branch...');
  const { matching, results } = await services.repos.findReposWithBranch(repos, branchName);

  for (const result of results) {
    if (result.error) {
      services.console.log(`${result.repoName}... ${chalk.red(`error: ${result.error}`)}`);
    } else if (result.hasBranch) {
      services.console.log(`${result.repoName}... ${chalk.green('found')}`);
    } else {
      services.console.log(`${result.repoName}... ${chalk.dim('no branch')}`);
    }
  }

  if (matching.length === 0) {
    services.console.error(`\nBranch "${branchName}" not found in any repo.`);
    services.process.exit(1);
  }

  services.console.log(
    `\nFound "${branchName}" in ${matching.length} repo(s). Creating worktrees...`
  );

  const result = await services.workspace.createCheckoutWorktrees(
    matching,
    destPath,
    branchName,
    config.copyFiles
  );

  services.workspace.copyAgentsMd(sourcePath, result.workspacePath);

  if (config.tmux) {
    const tmuxResult = await services.workspace.createTmuxSession(result.workspacePath, branchName);
    if (tmuxResult.success) {
      services.console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
    } else {
      services.console.error(chalk.yellow(`Warning: Failed to create tmux session: ${tmuxResult.error}`));
    }
  }

  services.console.log(
    `\nCreated workspace at ${chalk.cyan(result.workspacePath)} with ${result.successCount}/${result.totalCount} repos.`
  );

  if (config.postCheckout) {
    const shouldRun = await deps.confirm({
      message: `Run "${config.postCheckout}" in all workspaces?`,
      default: true,
    });

    if (shouldRun) {
      const worktreeDirs = services.workspace.getWorktreeDirs(result.workspacePath);
      services.console.log(`\nRunning "${config.postCheckout}" in ${worktreeDirs.length} workspace(s)...`);
      const completedCount = await services.workspace.runPostCheckoutCommand(worktreeDirs, config.postCheckout);
      services.console.log(`\nCompleted in ${completedCount}/${worktreeDirs.length} workspace(s).`);
    }
  } else {
    services.console.log('\nTip: Configure a post-checkout command to run automatically after branching/checkout.');
    services.console.log('  Example: flow config set post-checkout "npm ci"');
  }
}

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        await runCheckout(branchName, services, { confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
