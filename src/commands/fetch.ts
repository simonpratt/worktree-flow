import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { tryResolveWorkspace } from '../lib/workspaceResolver.js';

export async function runFetch(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services
): Promise<void> {
  const { destPath, sourcePath } = services.config.getRequired();

  const workspace = tryResolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  if (workspace) {
    services.console.log(`Fetching repos for workspace ${chalk.cyan(workspace.displayName)}...\n`);

    await useCases.fetchWorkspaceRepos.execute({
      workspacePath: workspace.workspacePath,
      sourcePath,
      fetchCacheTtlSeconds: 0,
      silent: false,
    });
  } else {
    services.console.log('Fetching all repos used across workspaces...\n');

    await useCases.fetchUsedRepos.execute({
      destPath,
      sourcePath,
      fetchCacheTtlSeconds: 0,
      silent: false,
    });
  }

  services.console.log(`\n${chalk.green('✓')} Fetch complete`);
}

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch [branch-name]')
    .helpGroup('Git Operations')
    .description('Fetch repos (workspace-scoped if branch provided, all workspaces otherwise)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runFetch(branchName, useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
