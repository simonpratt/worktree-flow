import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { NoReposFoundError } from '../lib/errors.js';

export async function runBranch(
  branchName: string,
  useCases: UseCases,
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

  // User prompts
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

  let shouldRunPostCheckout = false;
  if (config.postCheckout) {
    shouldRunPostCheckout = await deps.confirm({
      message: `Run "${config.postCheckout}" in all workspaces?`,
      default: true,
    });
  }

  services.console.log('\nCreating workspace...');

  // Fetch all selected repos
  await services.fetch.fetchRepos(selected, {
    ttlSeconds: config.fetchCacheTtlSeconds,
  });

  // Execute use case
  const result = await useCases.createBranchWorkspace.execute({
    repos: selected,
    branchName,
    sourceBranch,
    sourcePath,
    destPath,
    copyFiles: config.copyFiles,
    tmux: config.tmux,
    postCheckout: shouldRunPostCheckout ? config.postCheckout : undefined,
    perRepoPostCheckout: shouldRunPostCheckout ? config.perRepoPostCheckout: {},
  });

  // Display results
  services.console.log(
    `\nCreated workspace at ${chalk.cyan(result.workspacePath)} with ${result.successCount}/${result.totalCount} repos.`
  );

  if (result.tmuxCreated) {
    services.console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
  }

  if (result.postCheckoutSuccess !== undefined) {
    services.console.log(
      `\nCompleted post-checkout in ${result.postCheckoutSuccess}/${result.postCheckoutTotal} workspace(s).`
    );
  } else if (!config.postCheckout) {
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
      const useCases = createUseCases(services);

      try {
        await runBranch(branchName, useCases, services, { checkbox, input, confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
