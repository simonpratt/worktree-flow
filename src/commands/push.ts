import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';

export async function runPush(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services
): Promise<void> {
  const { workspacePath } = resolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  const dirs = services.workspaceDir.getWorktreeDirs(workspacePath);

  if (dirs.length === 0) {
    services.console.error('No repos found in workspace.');
    services.process.exit(1);
  }

  services.console.log(`Pushing ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);

  const result = await useCases.pushWorkspace.execute({ workspacePath });

  services.console.log(`\n${result.successCount}/${result.totalCount} repos pushed successfully.`);
}

export function registerPushCommand(program: Command): void {
  program
    .command('push [branch-name]')
    .description('Push all repos in a workspace (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runPush(branchName, useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
