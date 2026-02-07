import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { StatusService } from '../lib/status.js';
import { WorkspaceNotFoundError } from '../lib/errors.js';

export async function runStatus(branchName: string, services: Services): Promise<void> {
  const { destPath } = services.config.getRequired();
  const config = services.config.load();
  const workspacePath = path.join(destPath, branchName);

  const workspace = services.workspace.findWorkspace(destPath, branchName);
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspacePath);
  }

  services.console.log(`Workspace: ${chalk.cyan(workspacePath)}`);

  const worktreeDirs = services.workspace.getWorktreeDirs(workspacePath);

  if (worktreeDirs.length === 0) {
    services.console.log('\nNo worktrees found in workspace.');
    return;
  }

  services.console.log('');
  await services.fetch.fetchRepos(worktreeDirs);

  services.console.log(`\nStatus (comparing against ${chalk.cyan(config.mainBranch)}):\n`);

  const results = await services.status.checkAllWorktrees(worktreeDirs, config.mainBranch);

  let cleanCount = 0;
  let issuesCount = 0;

  for (const { repoName, status } of results) {
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
    .command('status <branch-name>')
    .description('Show status of all worktrees in a workspace')
    .action(async (branchName: string) => {
      const services = createServices();

      try {
        await runStatus(branchName, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
