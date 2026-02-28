import chalk from 'chalk';
import { StatusService, type WorktreeStatus } from '../lib/status.js';
import type { IConsole } from '../adapters/types.js';
import type { Services } from '../lib/services.js';
import type { ParsedConfig } from '../lib/config.js';

type WorkspaceLoadingInfo = { name: string; repoCount: number };

type WorkspaceStatusInfo = {
  name: string;
  path: string;
  repoCount: number;
  isActive: boolean;
  statuses: Array<{ repoName: string; status: WorktreeStatus }>;
};

/**
 * Format a single repo's status as a display line, consistent across list and status commands.
 */
export function formatRepoStatusLine(
  repoName: string,
  status: WorktreeStatus,
  baseBranch: string
): string {
  const statusMessage = StatusService.getStatusMessage(status, baseBranch);
  const hasIssues = StatusService.hasIssues(status);
  const indicator = hasIssues ? chalk.red('✗') : chalk.green('✓');
  const message = hasIssues ? chalk.red(statusMessage) : chalk.green(statusMessage);
  const trackingInfo = status.upstreamBranch
    ? chalk.dim(` → ${status.upstreamBranch}`)
    : chalk.dim(' (no upstream)');
  return `    ${indicator} ${chalk.yellow(repoName)}: ${message}${trackingInfo}`;
}

/**
 * Render Phase 1: print a header and workspace rows with a "fetching..." indicator.
 * Returns the number of lines printed so the caller can clear them later.
 */
export function logStatusFetching(
  header: string,
  workspaces: WorkspaceLoadingInfo[],
  console: IConsole
): number {
  console.log(chalk.bold(`\n${header}`));
  for (const ws of workspaces) {
    const repoCount = chalk.dim(`(${ws.repoCount} repo${ws.repoCount === 1 ? '' : 's'})`);
    console.log(`  ${chalk.cyan(ws.name)} ${repoCount} ${chalk.dim('fetching...')}`);
  }
  console.log('');
  // blank line + header + N workspace lines + trailing blank
  return workspaces.length + 3;
}

/**
 * Render Phase 2: clear the Phase 1 lines then print the header and full workspace status.
 */
export function logStatus(
  header: string,
  workspaces: WorkspaceStatusInfo[],
  linesToClear: number,
  getBaseBranch: (workspacePath: string, repoName: string) => string,
  console: IConsole
): void {
  for (let i = 0; i < linesToClear; i++) {
    console.write('\x1b[1A'); // Move cursor up one line
    console.write('\x1b[2K'); // Clear entire line
  }

  console.log(chalk.bold(`\n${header}`));
  for (const workspace of workspaces) {
    const activeIndicator = workspace.isActive ? chalk.green('* ') : '  ';
    const repoCount = chalk.dim(`(${workspace.repoCount} repo${workspace.repoCount === 1 ? '' : 's'})`);
    console.log(`${activeIndicator}${chalk.cyan(workspace.name)} ${repoCount}`);

    for (const { repoName, status } of workspace.statuses) {
      const baseBranch = getBaseBranch(workspace.path, repoName);
      console.log(formatRepoStatusLine(repoName, status, baseBranch));
    }
    console.log('');
  }
}

/**
 * Build the ordered list of checkbox choices for a repo picker, grouping recently used
 * repos under a "Recently Used" separator and placing the rest below.
 *
 * @param createSeparator - factory from the display layer (e.g. inquirer's Separator constructor)
 */
export function buildRepoCheckboxChoices(
  repos: string[],
  services: Pick<Services, 'repos' | 'fetchCache'>,
  preSelected: string[],
  createSeparator: (label?: string) => unknown
): unknown[] {
  const choices = services.repos.formatRepoChoices(repos).map((choice) => ({
    ...choice,
    checked: preSelected.includes(choice.name),
  }));

  const recentlyUsed = new Set(services.fetchCache.getRecentlyUsedRepos(8));
  const commonlyUsed = choices.filter((c) => recentlyUsed.has(c.name));

  if (commonlyUsed.length > 0) {
    const commonlyUsedNames = new Set(commonlyUsed.map((c) => c.name));
    const remaining = choices.filter((c) => !commonlyUsedNames.has(c.name));
    return [
      createSeparator('Recently Used'),
      ...commonlyUsed,
      ...(remaining.length > 0 ? [createSeparator(), ...remaining] : []),
    ];
  }

  return choices;
}

/**
 * Get a human-readable status indicator for a workspace based on its worktree statuses.
 */
export function getStatusIndicator(workspace: {
  statuses: Array<{ repoName: string; status: any }>;
}): string {
  const hasUncommitted = workspace.statuses.some(s => s.status.type === 'uncommitted');
  const hasAhead = workspace.statuses.some(s => s.status.type === 'ahead');
  const hasBehind = workspace.statuses.some(s => s.status.type === 'behind');
  const hasDiverged = workspace.statuses.some(s => s.status.type === 'diverged');
  const hasError = workspace.statuses.some(s => s.status.type === 'error');

  if (hasUncommitted) {
    return chalk.yellow('uncommitted');
  } else if (hasDiverged) {
    return chalk.red('diverged');
  } else if (hasAhead && hasBehind) {
    return chalk.yellow('ahead');
  } else if (hasAhead) {
    return chalk.yellow('ahead');
  } else if (hasBehind) {
    return chalk.blue('behind');
  } else if (hasError) {
    return chalk.red('error');
  } else {
    return chalk.green('clean');
  }
}
