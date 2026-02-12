import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { StatusService } from '../lib/status.js';
import { getStatusIndicator } from './helpers.js';

export async function runList(useCases: UseCases, services: Services): Promise<void> {
  const { destPath, sourcePath } = services.config.getRequired();
  const config = services.config.load();
  const cwd = services.process.cwd();

  // Get basic workspace list immediately
  const basicWorkspaces = services.workspaceDir.listWorkspaces(destPath);

  if (basicWorkspaces.length === 0) {
    services.console.log('No workspaces found.');
    return;
  }

  // Phase 1: Show basic list immediately
  services.console.log(chalk.bold('\nWorkspaces:'));

  for (const workspace of basicWorkspaces) {
    const repoCount = chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`);
    services.console.log(
      `  ${chalk.cyan(workspace.name)} ${repoCount} ${chalk.dim('fetching...')}`,
    );
  }
  services.console.log('');

  // Phase 2: Fetch repos used across all workspaces
  await useCases.fetchUsedRepos.execute({
    destPath,
    sourcePath,
    fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    silent: true,
  });

  // Phase 3: Check status for all workspaces
  const result = await useCases.listWorkspacesWithStatus.execute({
    destPath,
    sourcePath,
    cwd,
  });

  // Phase 4: Clear previous output and re-print with status
  // Lines to clear:
  // - 2 lines from '\nWorkspaces:' (blank line + header)
  // - N workspace lines
  // - 1 empty line after workspaces
  const linesToClear = 2 + basicWorkspaces.length + 1;

  for (let i = 0; i < linesToClear; i++) {
    services.console.write('\x1b[1A'); // Move cursor up one line
    services.console.write('\x1b[2K'); // Clear entire line
  }

  // Re-print with full status information
  services.console.log(chalk.bold('\nWorkspaces:'));
  for (const workspace of result.workspaces) {
    const statusIndicator = getStatusIndicator(workspace);
    const activeIndicator = workspace.isActive ? chalk.green('* ') : '  ';
    const repoCount = chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`);

    services.console.log(
      `${activeIndicator}${chalk.cyan(workspace.name)} ${repoCount} ${statusIndicator}`,
    );
  }
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List all workspaces with status indicators')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runList(useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
