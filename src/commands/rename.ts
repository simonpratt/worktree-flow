import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import type { RenameRepoResult } from '../usecases/renameWorkspaceBranches.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { sanitizeBranchForFolder } from '../lib/workspaceDirectory.js';

export async function runRename(
  oldBranchName: string | undefined,
  newBranchName: string,
  useCases: UseCases,
  services: Services,
  options: { gitOnly?: boolean } = {}
): Promise<void> {
  const { sourcePath, destPath } = services.config.getRequired();
  const config = services.config.load();

  const { workspacePath, displayName: oldDisplayName } = resolveWorkspace(
    oldBranchName,
    services.workspaceDir,
    services.workspaceConfig,
    services.config,
    services.process
  );

  if (sanitizeBranchForFolder(oldDisplayName) === sanitizeBranchForFolder(newBranchName)) {
    throw new Error(`New name "${newBranchName}" is the same as the current name.`);
  }

  services.console.log(`\nRenaming workspace "${oldDisplayName}" to "${newBranchName}"...`);

  let targetPath = workspacePath;
  let folderFailures: RenameRepoResult[] = [];

  const shouldRenameFolder = !options.gitOnly;
  if (shouldRenameFolder) {
    const folder = await useCases.renameWorkspaceFolder.execute({
      workspacePath,
      newBranchName,
      sourcePath,
      destPath,
    });
    targetPath = folder.newWorkspacePath;
    folderFailures = folder.failedRepos;
  }

  const branches = await useCases.renameWorkspaceBranches.execute({
    workspacePath: targetPath,
    newBranchName,
    sourcePath,
    skipRepos: folderFailures.map((r) => r.repoName),
  });

  const session = await useCases.renameSession.execute({
    sessionManager: config.sessionManager,
    oldName: oldDisplayName,
    newName: newBranchName,
  });

  const repoResults = [...folderFailures, ...branches.repoResults];

  for (const { repoName, error } of repoResults) {
    if (error) {
      services.console.log(`${repoName}... ${chalk.red(`error: ${error}`)}`);
    } else {
      services.console.log(`${repoName}... ${chalk.green('renamed')}`);
    }
  }

  const successCount = repoResults.filter((r) => !r.error).length;
  const totalCount = repoResults.length;
  const allSucceeded = successCount === totalCount;

  if (totalCount > 0) {
    services.console.log(`\nRenamed ${successCount}/${totalCount} repo(s).`);
  }

  services.console.log(`${chalk.green('Workspace:')} ${targetPath}`);

  if (!allSucceeded) {
    services.console.log(
      chalk.yellow(
        'Some repos could not be switched to the new branch — they remain on their previous branch.'
      )
    );
  }

  if (session.renamed) {
    services.console.log(`${chalk.green(`Renamed ${config.sessionManager} session to:`)} ${newBranchName}`);
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
    .option('--git-only', 'Rename the branches only, leaving the workspace folder untouched')
    .action(async (name: string, newName: string | undefined, options: { gitOnly?: boolean }) => {
      const services = createServices();
      const useCases = createUseCases(services);

      const oldBranchName = newName ? name : undefined;
      const newBranchName = newName ? newName : name;

      try {
        await runRename(oldBranchName, newBranchName, useCases, services, options);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
