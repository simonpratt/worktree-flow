import path from 'node:path';
import { Command } from 'commander';
import checkbox, { Separator } from '@inquirer/checkbox';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { NoReposFoundError } from '../lib/errors.js';
import { buildRepoCheckboxChoices } from './helpers.js';

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
  const checkboxChoices = buildRepoCheckboxChoices(repos, services, config.branchAutoSelectRepos, (label) => new Separator(label));

  const selected = await deps.checkbox({
    message: `Select repos for branch "${branchName}":`,
    choices: checkboxChoices,
    pageSize: 20,
    loop: false,
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

  // 1. Create workspace directory, placeholder config, AGENTS.md, tmux session
  const workspaceResult = await useCases.createWorkspace.execute({
    branchName,
    sourcePath,
    destPath,
    tmux: config.tmux,
  });

  const { workspacePath, tmuxCreated } = workspaceResult;
  const sessionName = tmuxCreated ? branchName : undefined;

  // 2. For each selected repo in parallel: createBranch then addToWorkspace
  const results = await Promise.allSettled(
    selected.map(async (repoPath) => {
      const repoName = path.basename(repoPath);

      // Resolve per-repo post-checkout command
      const repoConf = services.repoConfig.load(repoPath);
      const resolvedPostCheckout = shouldRunPostCheckout
        ? services.repoConfig.resolvePostCheckout(
            repoName,
            config.perRepoPostCheckout,
            repoConf,
            config.postCheckout
          )
        : undefined;

      // a. Create branch in source repo
      const branchResult = await useCases.createBranch.execute({
        repoPath,
        branchName,
        sourceBranch,
      });

      // b. Add repo to workspace (creates worktree, copies files, tmux pane, post-checkout)
      return useCases.addToWorkspace.execute({
        repoPath,
        workspacePath,
        branchName,
        baseBranch: branchResult.baseBranch,
        sessionName,
        copyFiles: config.copyFiles,
        postCheckout: resolvedPostCheckout,
      });
    })
  );

  // Track which repos were branched from
  services.fetchCache.trackBranchUsage(selected.map((r) => path.basename(r)));

  // Tally results
  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const totalCount = results.length;

  const postCheckoutResults = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof useCases.addToWorkspace.execute>>> =>
      r.status === 'fulfilled'
    )
    .map((r) => r.value)
    .filter((r) => r.postCheckoutRan);

  const postCheckoutSuccess = postCheckoutResults.filter((r) => r.postCheckoutSuccess).length;
  const postCheckoutTotal = postCheckoutResults.length;

  // Display results
  services.console.log(
    `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${totalCount} repos.`
  );

  if (tmuxCreated) {
    services.console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
  }

  if (postCheckoutTotal > 0) {
    services.console.log(
      `\nCompleted post-checkout in ${postCheckoutSuccess}/${postCheckoutTotal} workspace(s).`
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
