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
