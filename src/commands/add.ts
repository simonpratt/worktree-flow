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
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { buildRepoCheckboxChoices } from './helpers.js';

export async function runAdd(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services,
  deps: {
    checkbox: (opts: any) => Promise<string[]>;
    input: (opts: any) => Promise<string>;
    confirm: (opts: { message: string; default: boolean }) => Promise<boolean>;
  }
): Promise<void> {
  // 1. Resolve workspace (from arg or cwd)
  const { workspacePath, displayName } = resolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  const { sourcePath } = services.config.getRequired();
  const config = services.config.load();

  // 2. Discover all repos
  const repos = services.repos.discoverRepos(sourcePath);
  if (repos.length === 0) {
    throw new NoReposFoundError(sourcePath);
  }

  // 3. Filter out repos already in the workspace
  const existingWorktrees = services.workspaceDir
    .getWorktreeDirs(workspacePath)
    .map((dir) => path.basename(dir));
  const existingSet = new Set(existingWorktrees);

  const availableRepos = repos.filter(
    (repoPath) => !existingSet.has(path.basename(repoPath))
  );

  if (availableRepos.length === 0) {
    services.console.log('All repos are already in this workspace.');
    return;
  }

  // 4. Repo picker (same pattern as branch command)
  const checkboxChoices = buildRepoCheckboxChoices(availableRepos, services, [], (label) => new Separator(label));

  const selected = await deps.checkbox({
    message: `Select repos to add to "${displayName}":`,
    choices: checkboxChoices,
    pageSize: 20,
    loop: false,
  });

  if (selected.length === 0) {
    services.console.log('No repos selected.');
    return;
  }

  // 5. Ask for source branch
  const sourceBranch = await deps.input({
    message: 'Branch from which branch?',
    default: 'master',
  });

  // 6. Post-checkout confirmation
  let shouldRunPostCheckout = false;
  if (config.postCheckout) {
    shouldRunPostCheckout = await deps.confirm({
      message: `Run "${config.postCheckout}" in new workspaces?`,
      default: true,
    });
  }

  services.console.log('\nAdding repos to workspace...');

  // 7. Fetch selected repos
  await services.fetch.fetchRepos(selected, {
    ttlSeconds: config.fetchCacheTtlSeconds,
  });

  // 8. For each selected repo in parallel: createBranch then addToWorkspace
  // If tmux is enabled, use the workspace branch name as session name
  const sessionName = config.tmux ? displayName : undefined;

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
        branchName: displayName,
        sourceBranch,
      });

      // b. Add repo to workspace (creates worktree, copies files, tmux pane, post-checkout)
      return useCases.addToWorkspace.execute({
        repoPath,
        workspacePath,
        branchName: displayName,
        baseBranch: branchResult.baseBranch,
        sessionName,
        copyFiles: config.copyFiles,
        postCheckout: resolvedPostCheckout,
      });
    })
  );

  // 9. Track usage
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

  // 10. Display results
  services.console.log(
    `\nAdded ${successCount}/${totalCount} repos to ${chalk.cyan(workspacePath)}.`
  );

  if (postCheckoutTotal > 0) {
    services.console.log(
      `\nCompleted post-checkout in ${postCheckoutSuccess}/${postCheckoutTotal} workspace(s).`
    );
  }
}

export function registerAddCommand(program: Command): void {
  program
    .command('add [branch-name]')
    .description('Add repos to an existing workspace (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runAdd(branchName, useCases, services, { checkbox, input, confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
