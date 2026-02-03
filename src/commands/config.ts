import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { isValidKey, loadConfig, saveConfig, type FlowtreeConfig } from '../lib/config.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage flow configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (source-path, dest-path, config-files)')
    .action((key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: ${key}\nValid keys: source-path, dest-path, config-files`
        );
        process.exit(1);
      }

      const config = loadConfig();

      // Only resolve paths for path-related config keys
      if (key === 'source-path' || key === 'dest-path') {
        const resolved = path.resolve(value);
        config[key] = resolved;
        saveConfig(config);
        console.log(chalk.green(`Set ${key} = ${resolved}`));
      } else {
        // For non-path keys (like config-files), use the value as-is
        config[key] = value;
        saveConfig(config);
        console.log(chalk.green(`Set ${key} = ${value}`));
      }
    });

  configCmd
    .command('list')
    .description('List all config options and their current values')
    .action(() => {
      const config = loadConfig();
      const validKeys: (keyof FlowtreeConfig)[] = ['source-path', 'dest-path', 'config-files'];

      console.log(chalk.bold('\nCurrent configuration:'));
      console.log();

      for (const key of validKeys) {
        const value = config[key];
        if (value) {
          console.log(`  ${chalk.cyan(key)}: ${chalk.green(value)}`);
        } else {
          // Show default for config-files
          if (key === 'config-files') {
            console.log(`  ${chalk.cyan(key)}: ${chalk.gray('.env (default)')}`);
          } else {
            console.log(`  ${chalk.cyan(key)}: ${chalk.gray('(not set)')}`);
          }
        }
      }
      console.log();
    });
}
