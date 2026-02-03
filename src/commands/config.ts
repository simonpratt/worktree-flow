import { Command } from 'commander';
import chalk from 'chalk';
import { z } from 'zod';
import {
  isValidKey,
  loadRawConfig,
  saveRawConfig,
  loadConfig,
  validateAndTransformConfigValue,
  CONFIG_KEYS,
  type ConfigKey,
} from '../lib/config.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage flow configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (source-path, dest-path, copy-files, tmux, main-branch)')
    .action((key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: ${key}\nValid keys: ${CONFIG_KEYS.join(', ')}`
        );
        process.exit(1);
      }

      try {
        const config = loadRawConfig();
        const transformedValue = validateAndTransformConfigValue(key, value);

        config[key] = transformedValue as any;
        saveRawConfig(config);

        console.log(chalk.green(`Set ${key} = ${transformedValue}`));
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error(`Invalid value for ${key}: ${error.issues[0].message}`);
        } else {
          console.error(`Error setting config: ${error}`);
        }
        process.exit(1);
      }
    });

  configCmd
    .command('list')
    .description('List all config options and their current values')
    .action(() => {
      const rawConfig = loadRawConfig();
      const config = loadConfig();

      console.log(chalk.bold('\nCurrent configuration:'));
      console.log();

      const displayConfig: Record<ConfigKey, string> = {
        'source-path': rawConfig['source-path'] ?? chalk.gray('(not set)'),
        'dest-path': rawConfig['dest-path'] ?? chalk.gray('(not set)'),
        'copy-files': rawConfig['copy-files'] ?? chalk.gray(`${config.copyFiles} (default)`),
        'tmux': rawConfig.tmux ?? chalk.gray(`${config.tmux} (default)`),
        'main-branch': rawConfig['main-branch'] ?? chalk.gray(`${config.mainBranch} (default)`),
      };

      for (const key of CONFIG_KEYS) {
        const value = displayConfig[key];
        const displayValue = rawConfig[key] ? chalk.green(value) : value;
        console.log(`  ${chalk.cyan(key)}: ${displayValue}`);
      }
      console.log();
    });
}
