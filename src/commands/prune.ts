import { Command } from 'commander';
import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';

export async function runPrune(
  useCases: UseCases,
  services: Services,
  deps: { confirm: (opts: { message: string; default: boolean }) => Promise<boolean> }
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();

  services.console.log('Analyzing workspaces for pruning...\n');

  // Analyze workspaces to find prunable ones
  const result = await useCases.discoverPrunableWorkspaces.execute({
    destPath,
    sourcePath,
    mainBranch: config.mainBranch,
    daysOld: 7,
  });

  if (result.prunable.length === 0) {
    services.console.log('No workspaces to prune.');
    services.console.log(`\nWorkspaces are prunable when:`);
    services.console.log(`  - All worktrees have no uncommitted changes`);
    services.console.log(`  - All worktrees are not ahead of ${config.mainBranch}`);
    services.console.log(`  - Last commit is more than 7 days old`);
    services.process.exit(0);
  }

  // Display prunable workspaces
  services.console.log(`${chalk.yellow('Found')} ${chalk.cyan(result.prunable.length)} ${chalk.yellow('workspace(s) that can be pruned:')}\n`);

  for (const workspace of result.prunable) {
    const daysOld = Math.floor(
      (Date.now() - workspace.oldestCommitDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    services.console.log(`  ${chalk.cyan(workspace.name)}`);
    services.console.log(`    Repos: ${workspace.repoCount}`);
    services.console.log(`    Last commit: ${daysOld} days ago`);
    services.console.log(`    Status: ${chalk.green('clean')}`);
    services.console.log('');
  }

  const confirmed = await deps.confirm({
    message: 'Are you sure you want to prune these workspaces?',
    default: false,
  });

  if (!confirmed) {
    services.console.log('\nCancelled.');
    services.process.exit(0);
  }

  // Remove each workspace
  services.console.log('\nPruning workspaces...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const workspace of result.prunable) {
    try {
      services.console.log(`Removing ${chalk.cyan(workspace.name)}...`);

      await useCases.removeWorkspace.execute({
        workspacePath: workspace.path,
        branchName: workspace.name,
        sourcePath,
        mainBranch: config.mainBranch,
        tmux: config.tmux,
      });

      services.console.log(`  ${chalk.green('✓')} Removed ${workspace.name}`);
      successCount++;
    } catch (error: any) {
      services.console.log(`  ${chalk.red('✗')} Failed to remove ${workspace.name}: ${error.message}`);
      errorCount++;
    }
  }

  // Display summary
  services.console.log('');
  if (successCount > 0) {
    services.console.log(`${chalk.green('Successfully pruned')} ${successCount} workspace(s)`);
  }
  if (errorCount > 0) {
    services.console.log(`${chalk.red('Failed to prune')} ${errorCount} workspace(s)`);
  }
}

export function registerPruneCommand(program: Command): void {
  program
    .command('prune')
    .description('Remove old workspaces with no uncommitted changes and commits older than 7 days')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runPrune(useCases, services, { confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
