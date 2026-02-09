import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';

export async function runFetch(useCases: UseCases, services: Services): Promise<void> {
  const { destPath, sourcePath } = services.config.getRequired();

  services.console.log('Fetching all repos used across workspaces...\n');

  await useCases.fetchUsedRepos.execute({
    destPath,
    sourcePath,
    fetchCacheTtlSeconds: 0, // Bypass cache
    silent: false,
  });

  services.console.log(`\n${chalk.green('✓')} Fetch complete`);
}

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('Fetch all repos used across workspaces (bypasses cache)')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runFetch(useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
