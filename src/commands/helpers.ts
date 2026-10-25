import path from 'node:path';
import chalk from 'chalk';
import { StatusService, type WorktreeStatus } from '../lib/status.js';
import type { IConsole } from '../adapters/types.js';
import type { Services } from '../lib/services.js';
import { EmptyRepoGroupError, PromptCancelledError, RepoGroupNotFoundError, RepoNotFoundError } from '../lib/errors.js';
import type { MultiselectOptions, PickOneOptions, RepoPickerOptions } from './prompts.js';
import type { AddToWorkspaceResult } from '../usecases/addToWorkspace.js';
import type { OpenWorkspaceSessionResult } from '../usecases/openWorkspaceSession.js';
import type { SessionManagerKind } from '../lib/sessionManager.js';


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
 * Render a plain workspace list without status.
 */
export function logWorkspaces(
  header: string,
  workspaces: Array<WorkspaceLoadingInfo & { isActive: boolean }>,
  console: IConsole
): void {
  console.log(chalk.bold(`\n${header}`));
  for (const ws of workspaces) {
    const activeIndicator = ws.isActive ? chalk.green('* ') : '  ';
    const repoCount = chalk.dim(`(${ws.repoCount} repo${ws.repoCount === 1 ? '' : 's'})`);
    console.log(`${activeIndicator}${chalk.cyan(ws.name)} ${repoCount}`);
  }
  console.log('');
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
 * Build the options for the repo picker, pre-selecting the paths of repos named in `preSelected`.
 */
export function buildRepoOptions(
  repos: string[],
  services: Pick<Services, 'repos'>,
  preSelected: string[]
): Pick<RepoPickerOptions, 'options' | 'initialValues'> {
  const choices = services.repos.formatRepoChoices(repos);

  return {
    options: choices.map((choice) => ({ value: choice.value, label: choice.name })),
    initialValues: choices.filter((choice) => preSelected.includes(choice.name)).map((choice) => choice.value),
  };
}

/**
 * Pick a workspace from those in dest-path, each labelled with its branch name and
 * repo count, with the active workspace (from the current directory) marked `*`.
 * Returns the chosen workspace's path.
 * @throws Error when there are no workspaces
 */
export async function pickWorkspace(
  message: string,
  services: Pick<Services, 'config' | 'workspaceDir' | 'workspaceConfig' | 'process'>,
  pickOne: (opts: PickOneOptions) => Promise<string>
): Promise<string> {
  const { destPath } = services.config.getRequired();
  const workspaces = services.workspaceDir.listWorkspaces(destPath);
  if (workspaces.length === 0) {
    throw new Error('No workspaces found.');
  }

  const activePath = services.workspaceDir.detectWorkspace(services.process.cwd(), destPath);
  return pickOne({
    message,
    options: workspaces.map((ws) => {
      const name = services.workspaceConfig.getBranchName(ws.path) ?? ws.name;
      const marker = ws.path === activePath ? chalk.green('* ') : '  ';
      const repoCount = chalk.dim(`(${ws.repoCount} repo${ws.repoCount === 1 ? '' : 's'})`);
      return { value: ws.path, label: `${marker}${name} ${repoCount}` };
    }),
  });
}

/**
 * Report a command failure: exit quietly if the user cancelled a prompt, otherwise
 * print the error and exit non-zero.
 */
export function handleCommandError(error: any, services: Pick<Services, 'console' | 'process'>): void {
  if (error instanceof PromptCancelledError) {
    return;
  }
  services.console.error(error.message);
  services.process.exit(1);
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


export type MissingGroupRepo = { group: string; repo: string };

/**
 * Resolve the members of the named repo groups to repo paths, in group order and without
 * duplicates. Members not among `repoPaths` (e.g. renamed or deleted repos) are returned as
 * `missing` rather than failing. Throws RepoGroupNotFoundError if a group isn't defined.
 * @example resolveRepoGroups({ backend: ['api', 'gone'] }, ['backend'], ['/src/api']) →
 *   { repoPaths: ['/src/api'], missing: [{ group: 'backend', repo: 'gone' }] }
 */
export function resolveRepoGroups(
  groups: Record<string, string[]>,
  groupNames: string[],
  repoPaths: string[]
): { repoPaths: string[]; missing: MissingGroupRepo[] } {
  const byName = new Map(repoPaths.map((repoPath) => [path.basename(repoPath), repoPath]));
  const resolved = new Set<string>();
  const missing: MissingGroupRepo[] = [];

  for (const group of groupNames) {
    const members = groups[group];
    if (!members) {
      throw new RepoGroupNotFoundError(group, Object.keys(groups).sort());
    }
    for (const repo of members) {
      const repoPath = byName.get(repo);
      if (repoPath) {
        resolved.add(repoPath);
      } else {
        missing.push({ group, repo });
      }
    }
  }

  return { repoPaths: Array.from(resolved), missing };
}

function logMissingGroupRepos(missing: MissingGroupRepo[], console: IConsole): void {
  for (const { group, repo } of missing) {
    console.log(chalk.yellow(`Warning: repo "${repo}" in group "${group}" is not in the source-path, skipping.`));
  }
}

export type RepoSelection = {
  /** Every repo in the source-path, which group members are resolved against. */
  allRepos: string[];
  /** The repos that can be selected (e.g. excluding those already in the workspace). */
  candidates: string[];
  repoGroups: Record<string, string[]>;
  /** From --repo; with groupNames, skips the prompts when either is non-empty. */
  repoNames: string[];
  /** From --group. */
  groupNames: string[];
  message: string;
};

export type RepoSelectionDeps = {
  pickRepos: (opts: RepoPickerOptions) => Promise<string[]>;
  pickGroups: (opts: MultiselectOptions) => Promise<string[]>;
};

/**
 * Choose repos for a workspace, returning their paths. With --repo / --group this is the union
 * of both, with no prompts. Otherwise any defined repo groups are offered first, and the chosen
 * groups' members are pre-selected in the repo picker. Group members are only ever narrowed to
 * the candidates, so a group may include repos that are already in the workspace.
 * @throws RepoNotFoundError, RepoGroupNotFoundError, or EmptyRepoGroupError when no member of
 *   the --group groups is in the source-path
 */
export async function selectRepos(
  selection: RepoSelection,
  services: Pick<Services, 'repos' | 'console'>,
  deps: RepoSelectionDeps
): Promise<string[]> {
  const { allRepos, candidates, repoGroups, repoNames, groupNames, message } = selection;

  if (repoNames.length > 0 || groupNames.length > 0) {
    const fromRepos = resolveReposByName(candidates, repoNames);
    let fromGroups: string[] = [];
    if (groupNames.length > 0) {
      const { repoPaths, missing } = resolveRepoGroups(repoGroups, groupNames, allRepos);
      logMissingGroupRepos(missing, services.console);
      if (repoPaths.length === 0) {
        throw new EmptyRepoGroupError(groupNames);
      }
      fromGroups = repoPaths.filter((repoPath) => candidates.includes(repoPath));
    }
    return Array.from(new Set([...fromRepos, ...fromGroups]));
  }

  let preSelected: string[] = [];
  const definedGroups = Object.keys(repoGroups).sort();
  if (definedGroups.length > 0) {
    const chosen = await deps.pickGroups({
      message: 'Start from a repo group?',
      options: definedGroups.map((name) => ({
        value: name,
        label: `${name}  ${chalk.dim(repoGroups[name].join(', '))}`,
      })),
    });
    const { repoPaths, missing } = resolveRepoGroups(repoGroups, chosen, allRepos);
    logMissingGroupRepos(missing, services.console);
    preSelected = repoPaths.map((repoPath) => path.basename(repoPath));
  }

  return deps.pickRepos({ message, ...buildRepoOptions(candidates, services, preSelected) });
}


/**
 * Log the global copy-files setting, warn if it has no `.env` entry (so .env files won't
 * reach the worktrees), and list any copy-files entries that failed to copy.
 * @example logCopyFiles(results, '.env.local', console) →
 *   "Copy files: .env.local" + warning suggesting ".env,.env.local"
 */
export function logCopyFiles(
  results: Pick<AddToWorkspaceResult, 'repoName' | 'copyFailures'>[],
  copyFiles: string | undefined,
  console: IConsole
): void {
  const entries = (copyFiles ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  console.log(`\nCopy files: ${entries.length > 0 ? chalk.cyan(entries.join(',')) : chalk.dim('none')}`);

  if (!entries.some((f) => path.posix.basename(f) === '.env')) {
    console.log(chalk.yellow('Warning: copy-files does not include .env, so .env files are not copied into worktrees.'));
    console.log(`  To include it: flow config set copy-files "${['.env', ...entries].join(',')}"`);
  }

  for (const r of results) {
    for (const { file, error } of r.copyFailures) {
      console.log(chalk.yellow(`Warning: ${r.repoName}: failed to copy ${file} (${error})`));
    }
  }
}

/**
 * Logs the outcome of opening a workspace's session (nothing when no session manager is configured).
 */
export function logSession(
  result: OpenWorkspaceSessionResult,
  sessionManager: SessionManagerKind,
  sessionName: string,
  console: IConsole
): void {
  if (result.session === 'created') {
    console.log(`Created ${sessionManager} session: ${chalk.cyan(sessionName)}`);
  } else if (result.session === 'extended') {
    console.log(`Added panes to ${sessionManager} session: ${chalk.cyan(sessionName)}`);
  } else if (result.session === 'failed') {
    const fallback = result.postCheckout.length > 0 ? ' — ran post-checkout directly instead' : '';
    console.log(chalk.yellow(`Warning: could not open ${sessionManager} session (${result.sessionError})${fallback}`));
  }
}

/**
 * Logs that the herdr integration was just enabled, and how to turn it off.
 */
export function logHerdrIntegrationEnabled(console: IConsole): void {
  console.log(`Enabled herdr integration. To turn it off: ${chalk.cyan('flow config set session-manager none')}`);
}

/**
 * Logs how many post-checkout commands succeeded. Returns how many ran.
 */
export function logPostCheckout(result: OpenWorkspaceSessionResult, console: IConsole): number {
  const total = result.postCheckout.length;
  if (total > 0) {
    const success = result.postCheckout.filter((r) => r.success).length;
    console.log(`\nCompleted post-checkout in ${success}/${total} workspace(s).`);
  }
  return total;
}
