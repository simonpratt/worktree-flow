import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import { runCreate } from './create.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description(chalk.dim('Deprecated: use "flow create <branch-name>" instead'))
    .action(async (branchName: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      services.console.log(chalk.yellow('⚠ "flow branch" is deprecated. Use "flow create" instead.'));

      try {
        await runCreate(branchName, useCases, services, { checkbox, input, confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
