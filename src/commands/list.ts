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
    const activeIndicator = workspace.isActive ? chalk.green('* ') : '  ';
    const repoCount = chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`);

    services.console.log(
      `${activeIndicator}${chalk.cyan(workspace.name)} ${repoCount}`,
    );

    // Load workspace config to get per-repo base branches
    const workspaceConfig = services.workspaceConfig.load(workspace.path);
    const getBaseBranch = (repoName: string) =>
      workspaceConfig.baseBranches[repoName] || 'master';

    // Display each repo with its status and tracking branch
    for (const { repoName, status } of workspace.statuses) {
      const baseBranch = getBaseBranch(repoName);
      const statusMessage = StatusService.getStatusMessage(status, baseBranch);
      const hasIssues = StatusService.hasIssues(status);

      const indicator = hasIssues ? chalk.red('✗') : chalk.green('✓');
      const message = hasIssues ? chalk.red(statusMessage) : chalk.green(statusMessage);
      const trackingInfo = status.upstreamBranch
        ? chalk.dim(` → ${status.upstreamBranch}`)
        : chalk.dim(' (no upstream)');

      services.console.log(
        `    ${indicator} ${chalk.yellow(repoName)}: ${message}${trackingInfo}`,
      );
    }
    services.console.log(''); // Blank line between workspaces
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
