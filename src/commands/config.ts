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
      const rawConfig = services.config.loadRaw();
      const config = services.config.load();

      services.console.log(chalk.bold('\nCurrent configuration:'));
      services.console.log('');

      const displayConfig: Record<ConfigKey, string> = {
        'source-path': rawConfig['source-path'] ?? chalk.gray('(not set)'),
        'dest-path': rawConfig['dest-path'] ?? chalk.gray('(not set)'),
        'copy-files': rawConfig['copy-files'] ?? chalk.gray(`${config.copyFiles} (default)`),
        'tmux': rawConfig.tmux ?? chalk.gray(`${config.tmux} (default)`),
        'main-branch': rawConfig['main-branch'] ?? chalk.gray(`${config.mainBranch} (default)`),
        'post-checkout': rawConfig['post-checkout'] ?? chalk.gray('(not set)'),
      };

      for (const key of CONFIG_KEYS) {
        const value = displayConfig[key];
        const displayValue = rawConfig[key] ? chalk.green(value) : value;
        services.console.log(`  ${chalk.cyan(key)}: ${displayValue}`);
      }
      services.console.log('');
    });
}
