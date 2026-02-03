import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function execAsync(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
  });
  return stdout.trim();
}

export async function fetch(repoPath: string): Promise<void> {
  await execAsync(repoPath, ['fetch', '--all', '--prune']);
}

export async function remoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const output = await execAsync(repoPath, ['ls-remote', '--heads', 'origin', branch]);
  return output.length > 0;
}

export async function addWorktreeNewBranch(
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  await execAsync(repoPath, ['worktree', 'add', '-b', branch, worktreePath]);
}

export async function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  await execAsync(repoPath, ['worktree', 'add', worktreePath, branch]);
}

export async function pull(worktreePath: string): Promise<void> {
  await execAsync(worktreePath, ['pull']);
}

export async function push(worktreePath: string): Promise<void> {
  await execAsync(worktreePath, ['push']);
}

export async function pushSetUpstream(worktreePath: string, branch: string): Promise<void> {
  await execAsync(worktreePath, ['push', '--set-upstream', 'origin', branch]);
}

export async function getCurrentBranch(worktreePath: string): Promise<string> {
  return await execAsync(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
}
