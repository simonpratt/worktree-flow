import { Command } from 'commander';
import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { StatusService } from '../lib/status.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';

export async function runRemove(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services,
  deps: { confirm: (opts: { message: string; default: boolean }) => Promise<boolean> }
): Promise<void> {
  const { sourcePath } = services.config.getRequired();
  const config = services.config.load();
  const { workspacePath, displayName: branchNameForDisplay } = resolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  services.console.log(`Checking workspace: ${chalk.cyan(workspacePath)}`);

  // Get worktree dirs to show what will be removed
  const worktreeDirs = services.workspaceDir.getWorktreeDirs(workspacePath);

  // Display status check if worktrees exist
  if (worktreeDirs.length > 0) {
    await useCases.fetchWorkspaceRepos.execute({
      workspacePath,
      sourcePath,
      fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    });

    services.console.log(`\nChecking for uncommitted changes and commits ahead of base branch...`);

    // Load workspace config to get per-repo base branches
    const workspaceConfig = services.workspaceConfig.load(workspacePath);
    const getBaseBranch = (repoName: string) =>
      workspaceConfig.baseBranches[repoName] || 'master';

    const results = await services.status.checkAllWorktrees(worktreeDirs, getBaseBranch);

    for (const { repoName, status } of results) {
      const baseBranch = getBaseBranch(repoName);
      const message = StatusService.getStatusMessage(status, baseBranch);
      if (StatusService.hasIssues(status)) {
        services.console.log(`${repoName}... ${chalk.red(message)}`);
      } else {
        services.console.log(`${repoName}... ${chalk.green(message)}`);
      }
    }
  } else {
    services.console.log('No worktrees found in workspace.');
  }

  // Show what will be removed
  services.console.log(`\n${chalk.yellow('This will remove:')}`);
  services.console.log(`  Directory: ${chalk.cyan(workspacePath)}`);
  if (worktreeDirs.length > 0) {
    services.console.log(`  Worktrees: ${worktreeDirs.length} repo(s)`);
  }
  if (config.tmux) {
    services.console.log(`  Tmux session: ${chalk.cyan(branchNameForDisplay)}`);
  }

  const confirmed = await deps.confirm({
    message: 'Are you sure you want to remove this workspace?',
    default: false,
  });

  if (!confirmed) {
    services.console.log('\nCancelled.');
    services.process.exit(0);
  }

  // Execute use case (will throw if there are issues)
  services.console.log('\nRemoving workspace...');
  const result = await useCases.removeWorkspace.execute({
    workspacePath,
    branchName: branchNameForDisplay,
    sourcePath,
    tmux: config.tmux,
  });

  // Display worktree removal results
  if (worktreeDirs.length > 0) {
    for (const { repo, error } of result.removalErrors) {
      if (error === 'source repo not found') {
        services.console.log(`${repo}... ${chalk.yellow('source repo not found, skipping worktree removal')}`);
      } else {
        services.console.log(`${repo}... ${chalk.red(`error: ${error}`)}`);
      }
    }

    const successfulRemovals = result.worktreesTotal - result.removalErrors.length;
    for (let i = 0; i < successfulRemovals; i++) {
      services.console.log(`${worktreeDirs[i].split('/').pop()}... ${chalk.green('removed')}`);
    }

    services.console.log(`\nRemoved ${result.worktreesRemoved}/${result.worktreesTotal} worktree(s).`);
  }

  // Display results
  if (result.workspaceDirRemoved) {
    services.console.log(`${chalk.green('Removed:')} ${workspacePath}`);
  }

  if (result.tmuxKilled) {
    services.console.log(`${chalk.green('Killed tmux session:')} ${branchNameForDisplay}`);
  }

  services.console.log(`\n${chalk.green('Successfully removed workspace:')} ${branchNameForDisplay}`);
}

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove [branch-name]')
    .description('Remove a workspace and all its worktrees (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runRemove(branchName, useCases, services, { confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
