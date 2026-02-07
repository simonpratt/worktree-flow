import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';

export async function runList(services: Services): Promise<void> {
  const { destPath } = services.config.getRequired();
  const workspaces = services.workspace.listWorkspaces(destPath);

  if (workspaces.length === 0) {
    services.console.log('No workspaces found.');
    return;
  }

  services.console.log(chalk.bold('\nWorkspaces:'));
  for (const workspace of workspaces) {
    services.console.log(
      `  ${chalk.cyan(workspace.name)} ${chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`)}`,
    );
  }
  services.console.log('');
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all workspaces in the target directory')
    .action(async () => {
      const services = createServices();

      try {
        await runList(services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
