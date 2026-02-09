import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { StatusService } from '../lib/status.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';

export async function runStatus(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services
): Promise<void> {
  const { sourcePath } = services.config.getRequired();
  const config = services.config.load();
  const { workspacePath } = resolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  services.console.log(`Workspace: ${chalk.cyan(workspacePath)}`);

  const worktreeDirs = services.workspaceDir.getWorktreeDirs(workspacePath);

  if (worktreeDirs.length === 0) {
    services.console.log('\nNo worktrees found in workspace.');
    return;
  }

  // Fetch workspace repos
  await useCases.fetchWorkspaceRepos.execute({
    workspacePath,
    sourcePath,
    fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
  });

  services.console.log('');
  services.console.log(`\nStatus (comparing against ${chalk.cyan(config.mainBranch)}):\n`);

  const result = await useCases.checkWorkspaceStatus.execute({
    workspacePath,
    mainBranch: config.mainBranch,
  });

  let cleanCount = 0;
  let issuesCount = 0;

  for (const { repoName, status } of result.statuses) {
    const message = StatusService.getStatusMessage(status, config.mainBranch);

    if (StatusService.hasIssues(status)) {
      services.console.log(`  ${chalk.red('✗')} ${repoName}: ${chalk.red(message)}`);
      issuesCount++;
    } else {
      services.console.log(`  ${chalk.green('✓')} ${repoName}: ${chalk.green(message)}`);
      cleanCount++;
    }
  }

  services.console.log('');
  services.console.log(`Summary: ${chalk.green(`${cleanCount} up to date`)}, ${issuesCount > 0 ? chalk.red(`${issuesCount} with issues`) : chalk.green('0 with issues')}`);
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status [branch-name]')
    .description('Show status of all worktrees in a workspace (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runStatus(branchName, useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
