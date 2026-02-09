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
    // Fetch all repos from source-path
    await useCases.fetchAllRepos.execute({
      sourcePath,
      fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    });

    // Execute use case
    const result = await useCases.checkoutWorkspace.execute({
      branchName,
      sourcePath,
      destPath,
      copyFiles: config.copyFiles,
      tmux: config.tmux,
      postCheckout: shouldRunPostCheckout ? config.postCheckout : undefined,
    });

    // Display branch check results
    for (const checkResult of result.branchCheckResults) {
      if (checkResult.error) {
        services.console.log(`${checkResult.repoName}... ${chalk.red(`error: ${checkResult.error}`)}`);
      } else if (checkResult.hasBranch) {
        services.console.log(`${checkResult.repoName}... ${chalk.green('found')}`);
      } else {
        services.console.log(`${checkResult.repoName}... ${chalk.dim('no branch')}`);
      }
    }

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
  } catch (error: any) {
    services.console.error(error.message);
    services.process.exit(1);
  }
}

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      await runCheckout(branchName, useCases, services, { confirm });
    });
}
