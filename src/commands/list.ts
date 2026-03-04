import { Command } from 'commander';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { logStatusFetching, logStatus } from './helpers.js';

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
  const loadingLines = logStatusFetching('Workspaces:', basicWorkspaces, services.console);

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

  // Phase 4: Clear previous output and re-print with full status
  logStatus(
    'Workspaces:',
    result.workspaces,
    loadingLines,
    services.console,
  );
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .helpGroup('Workspaces')
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
