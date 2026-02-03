import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import confirm from '@inquirer/confirm';
import { processInParallel } from './parallel.js';
import type { ParsedConfig } from './config.js';

const execAsync = promisify(exec);

export function createWorkspaceDir(destPath: string, branch: string): string {
  const workspacePath = path.join(destPath, branch);
  if (fs.existsSync(workspacePath)) {
    console.error(`Workspace already exists: ${workspacePath}`);
    process.exit(1);
  }
  fs.mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

export function copyAgentsMd(sourcePath: string, workspacePath: string): void {
  const agentsPath = path.join(sourcePath, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    fs.copyFileSync(agentsPath, path.join(workspacePath, 'AGENTS.md'));
  }
}

export function copyConfigFilesToWorktree(
  sourceRepoPath: string,
  worktreePath: string,
  copyFiles?: string
): void {
  // Default to .env if not specified
  const files = (copyFiles || '.env')
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);

  // Copy each config file from source repo to worktree
  for (const file of files) {
    const sourceFilePath = path.join(sourceRepoPath, file);
    const destFilePath = path.join(worktreePath, file);

    // Skip if file doesn't exist in source repo
    if (!fs.existsSync(sourceFilePath)) {
      continue;
    }

    // Copy file to worktree
    try {
      fs.copyFileSync(sourceFilePath, destFilePath);
    } catch {
      // Silently ignore copy errors
    }
  }
}

export function detectWorkspace(cwd: string, destPath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const normalizedDest = path.resolve(destPath);

  if (
    !normalizedCwd.startsWith(normalizedDest + path.sep) &&
    normalizedCwd !== normalizedDest
  ) {
    return null;
  }

  const relative = path.relative(normalizedDest, normalizedCwd);
  const segments = relative.split(path.sep);

  if (segments.length === 0 || segments[0] === '') {
    return null;
  }

  const workspacePath = path.join(normalizedDest, segments[0]);
  if (!fs.existsSync(workspacePath)) {
    return null;
  }

  return workspacePath;
}

export function getWorktreeDirs(workspacePath: string): string[] {
  const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(workspacePath, entry.name));
}

async function runPostCheckoutCommand(
  worktreeDirs: string[],
  command: string
): Promise<number> {
  console.log(`\nRunning "${command}" in ${worktreeDirs.length} workspace(s)...`);

  return processInParallel(
    worktreeDirs,
    (worktreeDir) => path.basename(worktreeDir),
    async (worktreeDir, name) => {
      await execAsync(command, { cwd: worktreeDir });
      return 'completed';
    }
  );
}

export async function promptAndRunPostCheckout(
  workspacePath: string,
  config: ParsedConfig
): Promise<void> {
  if (!config.postCheckout) {
    console.log('\nTip: Configure a post-checkout command to run automatically after branching/checkout.');
    console.log('  Example: flow config set post-checkout "npm ci"');
    return;
  }

  const shouldRun = await confirm({
    message: `Run "${config.postCheckout}" in all workspaces?`,
    default: true,
  });

  if (shouldRun) {
    const worktreeDirs = getWorktreeDirs(workspacePath);
    const completedCount = await runPostCheckoutCommand(worktreeDirs, config.postCheckout);
    console.log(`\nCompleted in ${completedCount}/${worktreeDirs.length} workspace(s).`);
  }
}
