import path from 'node:path';
import chalk from 'chalk';
import { StatusService, type WorktreeStatus } from '../lib/status.js';
import type { IConsole } from '../adapters/types.js';
import type { Services } from '../lib/services.js';
import { RepoNotFoundError } from '../lib/errors.js';


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
  status: WorktreeStatus
): string {
  const statusMessage = StatusService.getStatusMessage(status);
  const hasIssues = StatusService.hasIssues(status);
  const message = hasIssues ? chalk.red(statusMessage) : chalk.green(statusMessage);
  return `    ${chalk.yellow(repoName)}: ${message}`;
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
      console.log(formatRepoStatusLine(repoName, status));
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
 * Resolve repo names (as passed via `--repo`) to their full repo paths, matching
 * against the given candidate repo paths by basename. Throws RepoNotFoundError
 * if a requested name doesn't match any candidate.
 */
export function resolveReposByName(candidateRepoPaths: string[], repoNames: string[]): string[] {
  const byName = new Map(candidateRepoPaths.map((repoPath) => [path.basename(repoPath), repoPath]));

  return repoNames.map((name) => {
    const repoPath = byName.get(name);
    if (!repoPath) {
      throw new RepoNotFoundError(name, Array.from(byName.keys()).sort());
    }
    return repoPath;
  });
}

