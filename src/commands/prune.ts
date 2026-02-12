import { Command } from 'commander';
import chalk from 'chalk';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { getStatusIndicator } from './helpers.js';

export async function runPrune(
  useCases: UseCases,
  services: Services,
  deps: {
    checkbox: (opts: any) => Promise<string[]>;
    confirm: (opts: { message: string; default: boolean }) => Promise<boolean>;
  }
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();
  const cwd = services.process.cwd();

  // Check if workspaces exist
  const basicWorkspaces = services.workspaceDir.listWorkspaces(destPath);

  if (basicWorkspaces.length === 0) {
    services.console.log('No workspaces found.');
    services.process.exit(0);
  }

  // Fetch repos used across all workspaces
  await useCases.fetchUsedRepos.execute({
    destPath,
    sourcePath,
    fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
  });

  // Get full status for all workspaces
  const result = await useCases.listWorkspacesWithStatus.execute({
    destPath,
    sourcePath,
    cwd,
  });

  // Format choices for checkbox prompt
  const choices = result.workspaces.map(workspace => {
    const statusIndicator = getStatusIndicator(workspace);
    const repoCount = chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`);

    return {
      name: `${chalk.cyan(workspace.name)} ${repoCount} ${statusIndicator}`,
      value: workspace.name,
    };
  });

  // Let user select workspaces to prune
  const selected = await deps.checkbox({
    message: 'Select workspaces to prune:',
    choices,
    pageSize: 20,
  });

  if (selected.length === 0) {
    services.console.log('No workspaces selected.');
    services.process.exit(0);
  }

  // Get full workspace objects for selected items
  const selectedWorkspaces = result.workspaces.filter(w => selected.includes(w.name));

  // Confirm deletion
  const confirmed = await deps.confirm({
    message: `Are you sure you want to prune ${selected.length} workspace(s)?`,
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

  for (const workspace of selectedWorkspaces) {
    try {
      services.console.log(`Removing ${chalk.cyan(workspace.name)}...`);

      await useCases.removeWorkspace.execute({
        workspacePath: workspace.path,
        branchName: workspace.name,
        sourcePath,
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
    .alias('clean')
    .description('Select and remove workspaces')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runPrune(useCases, services, { checkbox, confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
