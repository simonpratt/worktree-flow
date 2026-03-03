import path from 'node:path';
import { Command } from 'commander';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';

export async function runCheckout(
  branchName: string,
  useCases: UseCases,
  services: Services,
  deps: { confirm: (opts: { message: string; default: boolean }) => Promise<boolean> }
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();

  let shouldRunPostCheckout = false;
  if (config.postCheckout) {
    shouldRunPostCheckout = await deps.confirm({
      message: `Run "${config.postCheckout}" in all workspaces?`,
      default: true,
    });
  }

  services.console.log('\nChecking for branch...');

  try {
    // 1. Fetch all repos from source-path
    await useCases.fetchAllRepos.execute({
      sourcePath,
      fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    });

    // 2. Discover repos and find which ones have the branch
    const discoverResult = await useCases.discoverReposWithBranch.execute({
      sourcePath,
      branchName,
    });

    // 3. Display per-repo branch check results
    for (const checkResult of discoverResult.branchCheckResults) {
      if (checkResult.error) {
        services.console.log(`${checkResult.repoName}... ${chalk.red(`error: ${checkResult.error}`)}`);
      } else if (checkResult.hasBranch) {
        services.console.log(`${checkResult.repoName}... ${chalk.green('found')}`);
      } else {
        services.console.log(`${checkResult.repoName}... ${chalk.dim('no branch')}`);
      }
    }

    // 4. Throw error if no repos match
    if (discoverResult.matchingRepos.length === 0) {
      throw new Error(`Branch "${branchName}" not found in any repo.`);
    }

    // 5. Create workspace directory, placeholder config, AGENTS.md, tmux session
    const workspaceResult = await useCases.createWorkspace.execute({
      branchName,
      sourcePath,
      destPath,
      tmux: config.tmux,
    });

    const { workspacePath, tmuxCreated } = workspaceResult;
    const sessionName = tmuxCreated ? branchName : undefined;

    // 6. For each matching repo in parallel: detect base branch, then addToWorkspace
    const results = await Promise.allSettled(
      discoverResult.matchingRepos.map(async (repoPath) => {
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

        // Detect base branch for this repo
        const baseBranch = await services.git.findFirstExistingBranch(
          repoPath,
          ['master', 'main', 'trunk', 'develop']
        ) ?? 'master';

        // Add repo to workspace (creates worktree, copies files, tmux pane, post-checkout)
        return useCases.addToWorkspace.execute({
          repoPath,
          workspacePath,
          branchName,
          baseBranch,
          sessionName,
          copyFiles: config.copyFiles,
          postCheckout: resolvedPostCheckout,
        });
      })
    );

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

    // 7. Display results
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
  } catch (error: any) {
    services.console.error(error.message);
    services.process.exit(1);
  }
}

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .helpGroup('Workspaces')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      await runCheckout(branchName, useCases, services, { confirm });
    });
}
