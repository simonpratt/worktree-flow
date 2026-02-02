import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { isValidKey, loadConfig, saveConfig } from '../lib/config.js';

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
}
