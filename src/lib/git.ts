import { execFileSync } from 'node:child_process';

function exec(repoPath: string, args: string[]): string {
  const result = execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

export function fetch(repoPath: string): void {
  exec(repoPath, ['fetch', '--all', '--prune']);
}

export function remoteBranchExists(repoPath: string, branch: string): boolean {
  const output = exec(repoPath, ['ls-remote', '--heads', 'origin', branch]);
  return output.length > 0;
}

export function addWorktreeNewBranch(
  repoPath: string,
  worktreePath: string,
  branch: string
): void {
  exec(repoPath, ['worktree', 'add', '-b', branch, worktreePath]);
}

export function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): void {
  exec(repoPath, ['worktree', 'add', worktreePath, branch]);
}

export function pull(worktreePath: string): void {
  exec(worktreePath, ['pull']);
}

export function push(worktreePath: string): void {
  exec(worktreePath, ['push']);
}

export function pushSetUpstream(worktreePath: string, branch: string): void {
  exec(worktreePath, ['push', '--set-upstream', 'origin', branch]);
}

export function getCurrentBranch(worktreePath: string): string {
  return exec(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
}
