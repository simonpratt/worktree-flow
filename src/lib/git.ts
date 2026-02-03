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

export async function localRemoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execAsync(repoPath, ['rev-parse', '--verify', `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function addWorktreeNewBranch(
  repoPath: string,
  worktreePath: string,
  branch: string,
  sourceBranch?: string
): Promise<void> {
  const args = ['worktree', 'add', '-b', branch, worktreePath];
  if (sourceBranch) {
    args.push(sourceBranch);
  }
  await execAsync(repoPath, args);
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

export async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  const output = await execAsync(repoPath, ['status', '--porcelain']);
  return output.length > 0;
}

export async function originBranchExists(repoPath: string): Promise<boolean> {
  try {
    const branch = await getCurrentBranch(repoPath);
    await execAsync(repoPath, ['rev-parse', '--verify', `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function isAheadOfOrigin(repoPath: string): Promise<boolean> {
  try {
    const branch = await getCurrentBranch(repoPath);
    const output = await execAsync(repoPath, ['rev-list', '--count', `origin/${branch}..HEAD`]);
    return parseInt(output, 10) > 0;
  } catch {
    return false;
  }
}

export async function isBehindOrigin(repoPath: string): Promise<boolean> {
  try {
    const branch = await getCurrentBranch(repoPath);
    const output = await execAsync(repoPath, ['rev-list', '--count', `HEAD..origin/${branch}`]);
    return parseInt(output, 10) > 0;
  } catch {
    return false;
  }
}

export async function isAheadOfMain(repoPath: string, mainBranch: string): Promise<boolean> {
  try {
    // Check if there's a diff between current branch and main
    const output = await execAsync(repoPath, ['diff', `origin/${mainBranch}...HEAD`]);
    return output.length > 0;
  } catch {
    // If we can't determine, assume there are changes to be safe
    return true;
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await execAsync(repoPath, ['worktree', 'remove', worktreePath]);
}
