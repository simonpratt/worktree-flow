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

  try {
    // 1. Fetch all repos from source-path
    console.log('');
    await useCases.fetchAllRepos.execute({
      sourcePath,
      fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    });

    // 2. Discover repos and find which ones have the branch
    const discoverResult = await useCases.discoverReposWithBranch.execute({
      sourcePath,
      branchName,
    });

    // 3. Display only repos that have changes (matching or errored)
    const discoveredCount = discoverResult.branchCheckResults.filter((r) => r.hasBranch).length;
    console.log(chalk.bold(`\nFound ${discoveredCount} repos with branch "${branchName}"`));
    for (const checkResult of discoverResult.branchCheckResults) {
      if (checkResult.error) {
        services.console.log(`${checkResult.repoName}... ${chalk.red(`error: ${checkResult.error}`)}`);
      } else if (checkResult.hasBranch) {
        services.console.log(`${checkResult.repoName}... ${chalk.green('found')}`);
      }
    }

    // 4. Throw error if no repos match
    if (discoverResult.matchingRepos.length === 0) {
      throw new Error(`Branch "${branchName}" not found in any repo.`);
    }

    // 4b. Abort if branch is already checked out in any matching repo
    const checkedOutRepos: { repoName: string; checkedOutPath: string }[] = [];
    for (const repoPath of discoverResult.matchingRepos) {
      const checkedOutAt = await services.git.getBranchCheckedOutPath(repoPath, branchName);
      if (checkedOutAt) {
        checkedOutRepos.push({ repoName: path.basename(repoPath), checkedOutPath: checkedOutAt });
      }
    }
    if (checkedOutRepos.length > 0) {
      for (const { repoName, checkedOutPath } of checkedOutRepos) {
        services.console.error(
          `${repoName}: branch "${branchName}" is already checked out at "${checkedOutPath}"`
        );
      }
      throw new Error(
        `Cannot create worktrees: branch "${branchName}" is already checked out in ${checkedOutRepos.length} repo(s).`
      );
    }

    // 5. Prompt for post-checkout
    let shouldRunPostCheckout = false;
    if (config.postCheckout) {
      console.log('');
      shouldRunPostCheckout = await deps.confirm({
        message: `Run "${config.postCheckout}" in all workspaces?`,
        default: true,
      });
    }

    // 6. Create workspace directory, placeholder config, AGENTS.md, tmux session
    const workspaceResult = await useCases.createWorkspace.execute({
      branchName,
      sourcePath,
      destPath,
      tmux: config.tmux,
    });

    const { workspacePath, tmuxCreated } = workspaceResult;
    const sessionName = tmuxCreated ? branchName : undefined;

    // 7. For each matching repo in parallel: detect base branch, then addToWorkspace
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

    // Report per-repo failures
    const failures = results
      .map((r, i) => ({ result: r, repoPath: discoverResult.matchingRepos[i] }))
      .filter((entry): entry is { result: PromiseRejectedResult; repoPath: string } =>
        entry.result.status === 'rejected'
      );

    for (const { result, repoPath } of failures) {
      const repoName = path.basename(repoPath);
      const errorMsg = result.reason?.stderr || result.reason?.message || 'unknown error';
      services.console.error(`${repoName}: ${errorMsg}`);
    }

    const postCheckoutResults = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof useCases.addToWorkspace.execute>>> =>
        r.status === 'fulfilled'
      )
      .map((r) => r.value)
      .filter((r) => r.postCheckoutRan);

    const postCheckoutSuccess = postCheckoutResults.filter((r) => r.postCheckoutSuccess).length;
    const postCheckoutTotal = postCheckoutResults.length;

    // 8. Display results
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

    // Exit non-zero if any repos failed
    if (successCount < totalCount) {
      services.process.exit(1);
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
