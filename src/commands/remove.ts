import { Command } from 'commander';
import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { StatusService } from '../lib/status.js';
import { WorkspaceHasIssuesError } from '../lib/errors.js';
import { resolveWorkspace } from '../lib/workspace.js';

export async function runRemove(
  branchName: string | undefined,
  services: Services,
  deps: { confirm: (opts: { message: string; default: boolean }) => Promise<boolean> }
): Promise<void> {
  const { sourcePath } = services.config.getRequired();
  const config = services.config.load();
  const { workspacePath, displayName: branchNameForDisplay } = resolveWorkspace(branchName, services);

  services.console.log(`Checking workspace: ${chalk.cyan(workspacePath)}`);

  const worktreeDirs = services.workspace.getWorktreeDirs(workspacePath);

  if (worktreeDirs.length === 0) {
    services.console.log('No worktrees found in workspace.');
  } else {
    await services.fetch.fetchRepos(worktreeDirs);

    services.console.log(`\nChecking for uncommitted changes and commits ahead of ${config.mainBranch}...`);
    const results = await services.status.checkAllWorktrees(worktreeDirs, config.mainBranch);

    const reposWithIssues: string[] = [];
    for (const { repoName, status } of results) {
      const message = StatusService.getStatusMessage(status, config.mainBranch);
      if (StatusService.hasIssues(status)) {
        services.console.log(`${repoName}... ${chalk.red(message)}`);
        reposWithIssues.push(repoName);
      } else {
        services.console.log(`${repoName}... ${chalk.green(message)}`);
      }
    }

    if (reposWithIssues.length > 0) {
      throw new WorkspaceHasIssuesError(
        `${reposWithIssues.length} repo(s) have uncommitted or unmerged changes.\nPlease commit and merge your changes first.`
      );
    }
  }

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

  if (worktreeDirs.length > 0) {
    services.console.log('\nRemoving worktrees...');
    const removeResult = await services.workspace.removeWorktrees(worktreeDirs, sourcePath);

    for (const { repo, error } of removeResult.errors) {
      if (error === 'source repo not found') {
        services.console.log(`${repo}... ${chalk.yellow('source repo not found, skipping worktree removal')}`);
      } else {
        services.console.log(`${repo}... ${chalk.red(`error: ${error}`)}`);
      }
    }

    const successfulRemovals = removeResult.totalCount - removeResult.errors.length;
    for (let i = 0; i < successfulRemovals; i++) {
      services.console.log(`${worktreeDirs[i].split('/').pop()}... ${chalk.green('removed')}`);
    }

    services.console.log(`\nRemoved ${removeResult.successCount}/${removeResult.totalCount} worktree(s).`);
  }

  services.console.log('\nRemoving workspace directory...');
  try {
    services.workspace.removeWorkspaceDir(workspacePath);
    services.console.log(`${chalk.green('Removed:')} ${workspacePath}`);
  } catch (err: any) {
    services.console.error(`${chalk.red('Failed to remove directory:')} ${err.message}`);
    services.process.exit(1);
  }

  if (config.tmux) {
    services.console.log('\nKilling tmux session...');
    const tmuxResult = await services.workspace.killTmuxSession(branchNameForDisplay);
    if (tmuxResult.success) {
      services.console.log(`${chalk.green('Killed tmux session:')} ${branchNameForDisplay}`);
    } else {
      services.console.error(chalk.yellow(`Warning: Failed to kill tmux session: ${tmuxResult.error}`));
    }
  }

  services.console.log(`\n${chalk.green('Successfully removed workspace:')} ${branchNameForDisplay}`);
}

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove [branch-name]')
    .description('Remove a workspace and all its worktrees (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();

      try {
        await runRemove(branchName, services, { confirm });
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
