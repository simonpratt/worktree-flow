import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { NoReposFoundError } from '../lib/errors.js';

export async function runBranch(
  branchName: string,
  services: Services,
  deps: {
    checkbox: (opts: any) => Promise<string[]>;
    input: (opts: any) => Promise<string>;
    confirm: (opts: { message: string; default: boolean }) => Promise<boolean>;
  }
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();
  const repos = services.repos.discoverRepos(sourcePath);

  if (repos.length === 0) {
    throw new NoReposFoundError(sourcePath);
  }

  const selected = await deps.checkbox({
    message: `Select repos for branch "${branchName}":`,
    choices: services.repos.formatRepoChoices(repos),
    pageSize: 20,
  });

  if (selected.length === 0) {
    services.console.log('No repos selected.');
    return;
  }

  const sourceBranch = await deps.input({
    message: 'Branch from which branch?',
    default: 'master',
  });

  await services.fetch.fetchRepos(selected);

  services.console.log('\nCreating worktrees...');
  const result = await services.workspace.createBranchWorktrees(
    selected,
    destPath,
    branchName,
    sourceBranch,
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

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description('Create branches and worktrees for selected repos')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        await runBranch(branchName, services, { checkbox, input, confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
