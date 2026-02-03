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
    .description('Set a config value (source-path, dest-path)')
    .action((key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: ${key}\nValid keys: source-path, dest-path`
        );
        process.exit(1);
      }

      const resolved = path.resolve(value);
      const config = loadConfig();
      config[key] = resolved;
      saveConfig(config);
      console.log(chalk.green(`Set ${key} = ${resolved}`));
    });

  configCmd
    .command('list')
    .description('List all config options and their current values')
    .action(() => {
      const config = loadConfig();
      const validKeys: (keyof FlowtreeConfig)[] = ['source-path', 'dest-path'];

      console.log(chalk.bold('\nCurrent configuration:'));
      console.log();

      for (const key of validKeys) {
        const value = config[key];
        if (value) {
          console.log(`  ${chalk.cyan(key)}: ${chalk.green(value)}`);
        } else {
          console.log(`  ${chalk.cyan(key)}: ${chalk.gray('(not set)')}`);
        }
      }
      console.log();
    });
}
