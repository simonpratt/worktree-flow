import fs from 'node:fs';
import path from 'node:path';

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
