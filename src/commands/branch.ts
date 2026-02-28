import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description(chalk.dim('Deprecated: use "flow create <branch-name>" instead'))
    .action(async () => {
      const services = createServices();

      services.console.log(chalk.yellow('⚠ "flow branch" is deprecated. Use "flow create" instead.'));
    });
}
