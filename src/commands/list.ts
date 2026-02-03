import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getRequiredConfig } from '../lib/config.js';
import { getWorktreeDirs } from '../lib/workspace.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all workspaces in the target directory')
    .action(async () => {
      const { destPath } = getRequiredConfig();

      if (!fs.existsSync(destPath)) {
        console.error(`Target directory does not exist: ${destPath}`);
        process.exit(1);
      }

      // Get all directories in destPath
      const entries = fs.readdirSync(destPath, { withFileTypes: true });
      const workspaces = entries
        .filter(entry => entry.isDirectory())
        .map(entry => ({
          name: entry.name,
          path: path.join(destPath, entry.name),
        }))
        .filter(workspace => {
          // Check if the directory contains any subdirectories (repos/worktrees)
          try {
            const worktrees = getWorktreeDirs(workspace.path);
            return worktrees.length > 0;
          } catch {
            return false;
          }
        });

      if (workspaces.length === 0) {
        console.log('No workspaces found.');
        return;
      }

      console.log(chalk.bold('\nWorkspaces:'));
      for (const workspace of workspaces) {
        const worktrees = getWorktreeDirs(workspace.path);
        console.log(
          `  ${chalk.cyan(workspace.name)} ${chalk.dim(`(${worktrees.length} repo${worktrees.length === 1 ? '' : 's'})`)}`,
        );
      }
      console.log();
    });
}
