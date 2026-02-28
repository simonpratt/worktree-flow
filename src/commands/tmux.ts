import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';

export async function runTmuxSync(useCases: UseCases, services: Services): Promise<void> {
  const { destPath } = services.config.getRequired();

  const result = await useCases.resumeTmuxSessions.execute({ destPath });

  if (result.totalWorkspaces === 0) {
    services.console.log('No workspaces found.');
    return;
  }

  // Display results
  if (result.sessionsCreated > 0) {
    services.console.log(
      chalk.green(`✓ Created ${result.sessionsCreated} tmux session${result.sessionsCreated === 1 ? '' : 's'}`)
    );
  }

  if (result.sessionsSkipped > 0) {
    services.console.log(
      chalk.blue(`○ Skipped ${result.sessionsSkipped} existing session${result.sessionsSkipped === 1 ? '' : 's'}`)
    );
  }

  if (result.errors.length > 0) {
    services.console.log(chalk.red('\nErrors:'));
    for (const error of result.errors) {
      services.console.log(chalk.red(`  ${error.workspace}: ${error.error}`));
    }
  }

  // Summary
  services.console.log(
    chalk.dim(`\nTotal: ${result.totalWorkspaces} workspace${result.totalWorkspaces === 1 ? '' : 's'}`)
  );
}

export function registerTmuxCommand(program: Command): void {
  const tmuxCommand = program
    .command('tmux')
    .description('Manage tmux sessions for workspaces');

  tmuxCommand
    .command('sync')
    .description('Create tmux sessions for all workspaces that don\'t have one')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runTmuxSync(useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
