import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { sanitizeBranchForFolder } from '../lib/workspaceDirectory.js';

export async function runRename(
  oldBranchName: string | undefined,
  newBranchName: string,
  useCases: UseCases,
  services: Services
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();

  const { workspacePath, displayName: oldDisplayName } = resolveWorkspace(
    oldBranchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  if (sanitizeBranchForFolder(oldDisplayName) === sanitizeBranchForFolder(newBranchName)) {
    throw new Error(`New name "${newBranchName}" is the same as the current name.`);
  }

  services.console.log(`\nRenaming workspace "${oldDisplayName}" to "${newBranchName}"...`);

  const result = await useCases.renameWorkspace.execute({
    workspacePath,
    oldBranchName: oldDisplayName,
    newBranchName,
    sourcePath,
    destPath,
    tmux: config.tmux,
  });

  for (const { repoName, error } of result.repoResults) {
    if (error) {
      services.console.log(`${repoName}... ${chalk.red(`error: ${error}`)}`);
    } else {
      services.console.log(`${repoName}... ${chalk.green('renamed')}`);
    }
  }

  const successCount = result.repoResults.filter((r) => !r.error).length;
  const totalCount = result.repoResults.length;
  const allSucceeded = successCount === totalCount;

  if (totalCount > 0) {
    services.console.log(`\nRenamed ${successCount}/${totalCount} repo(s).`);
  }

  services.console.log(`${chalk.green('Workspace:')} ${result.newWorkspacePath}`);

  if (!allSucceeded) {
    services.console.log(
      chalk.yellow(
        'Some repos could not be switched to the new branch — they remain in the renamed workspace on their previous branch.'
      )
    );
  }

  if (result.tmuxRenamed) {
    services.console.log(`${chalk.green('Renamed tmux session to:')} ${newBranchName}`);
  }

  if (!allSucceeded) {
    services.process.exit(1);
  }
}

export function registerRenameCommand(program: Command): void {
  program
    .command('rename <name> [new-name]')
    .helpGroup('Workspaces')
    .description(
      'Rename a workspace (auto-detects the current workspace from the current directory if only one name is given)'
    )
    .action(async (name: string, newName: string | undefined) => {
      const services = createServices();
      const useCases = createUseCases(services);

      const oldBranchName = newName ? name : undefined;
      const newBranchName = newName ? newName : name;

      try {
        await runRename(oldBranchName, newBranchName, useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
