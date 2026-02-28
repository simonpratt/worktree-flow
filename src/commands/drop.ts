import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { logStatusFetching, logStatus } from './helpers.js';
import { StatusService } from '../lib/status.js';
import { WorkspaceHasIssuesError } from '../lib/errors.js';

export async function runDrop(
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

  // Get worktree dirs to show what will be removed
  const worktreeDirs = services.workspaceDir.getWorktreeDirs(workspacePath);

  // Display status check if worktrees exist
  if (worktreeDirs.length > 0) {
    const workspaceName = path.basename(workspacePath);
    const repoCount = worktreeDirs.length;

    // Phase 1: Show header with fetching indicator
    const loadingLines = logStatusFetching('Workspace:', [{ name: workspaceName, repoCount }], services.console);

    // Fetch workspace repos (silently)
    await useCases.fetchWorkspaceRepos.execute({
      workspacePath,
      sourcePath,
      fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
      silent: true,
    });

    const statusResult = await useCases.checkWorkspaceStatus.execute({
      workspacePath,
    });

    // Load workspace config to get per-repo base branches
    const workspaceConfig = services.workspaceConfig.load(workspacePath);

    // Phase 2: Clear Phase 1 lines and re-render with full status
    logStatus(
      'Workspace:',
      [{ name: workspaceName, path: workspacePath, repoCount, isActive: false, statuses: statusResult.statuses }],
      loadingLines,
      (_, repoName) => workspaceConfig.baseBranches[repoName] || 'master',
      services.console,
    );

    // Block if any repos have uncommitted changes — user must resolve them first
    const reposWithIssues = statusResult.statuses.filter(({ status }) => StatusService.hasIssues(status));
    if (reposWithIssues.length > 0) {
      throw new WorkspaceHasIssuesError(
        `${reposWithIssues.length} repo(s) have uncommitted changes or errors. Resolve them before dropping.`
      );
    }
  } else {
    services.console.log('\nNo worktrees found in workspace.');
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
    message: 'Are you sure you want to drop this workspace?',
    default: false,
  });

  if (!confirmed) {
    services.console.log('\nCancelled.');
    services.process.exit(0);
  }

  // Execute use case (will throw if there are issues)
  services.console.log('\nDropping workspace...');
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

  services.console.log(`\n${chalk.green('Successfully dropped workspace:')} ${branchNameForDisplay}`);
}

export function registerDropCommand(program: Command): void {
  program
    .command('drop [branch-name]')
    .description('Drop a workspace and all its worktrees (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runDrop(branchName, useCases, services, { confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
