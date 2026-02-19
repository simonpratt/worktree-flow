import chalk from 'chalk';
import { StatusService, type WorktreeStatus } from '../lib/status.js';

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
