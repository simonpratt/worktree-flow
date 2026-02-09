import { Command } from 'commander';
import chalk from 'chalk';
import { z } from 'zod';
import {
  isValidKey,
  validateAndTransformConfigValue,
  CONFIG_KEYS,
  type ConfigKey,
} from '../lib/config.js';
import { createServices } from '../lib/services.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage flow configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (source-path, dest-path, copy-files, tmux, main-branch, post-checkout)')
    .action((key: string, value: string) => {
      const services = createServices();

      if (!isValidKey(key)) {
        services.console.error(
          `Unknown config key: ${key}\nValid keys: ${CONFIG_KEYS.join(', ')}`
        );
        services.process.exit(1);
      }

      try {
        const config = services.config.loadRaw();
        const transformedValue = validateAndTransformConfigValue(key as ConfigKey, value);

        (config as any)[key] = transformedValue;
        services.config.saveRaw(config);

        services.console.log(chalk.green(`Set ${key} = ${transformedValue}`));
      } catch (error) {
        if (error instanceof z.ZodError) {
          services.console.error(`Invalid value for ${key}: ${error.issues[0].message}`);
        } else {
          services.console.error(`Error setting config: ${error}`);
        }
        services.process.exit(1);
      }
    });

  configCmd
    .command('list')
    .description('List all config options and their current values')
    .action(() => {
      const services = createServices();

      services.console.log(chalk.bold('\nCurrent configuration:'));
      services.console.log('');

      const displayConfig = services.config.getDisplayConfig();

      for (const key of CONFIG_KEYS) {
        const { value, isDefault } = displayConfig[key];
        const displayValue = isDefault ? chalk.gray(value) : chalk.green(value);
        services.console.log(`  ${chalk.cyan(key)}: ${displayValue}`);
      }

      // Display per-repo post-checkout commands
      const perRepoCommands = displayConfig.perRepoPostCheckout;
      if (Object.keys(perRepoCommands).length > 0) {
        services.console.log('');
        services.console.log(chalk.bold('Per-repo post-checkout commands:'));
        services.console.log('');
        for (const [repo, command] of Object.entries(perRepoCommands)) {
          services.console.log(`  ${chalk.cyan(repo)}: ${chalk.green(command)}`);
        }
      }

      services.console.log('');
    });
}
