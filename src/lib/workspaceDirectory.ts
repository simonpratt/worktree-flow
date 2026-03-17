import path from 'node:path';
import type { IFileSystem } from '../adapters/types.js';
import { WorkspaceAlreadyExistsError } from './errors.js';

/**
 * Replaces characters that could cause filesystem issues with underscores.
 * e.g. "release/123" → "release_123"
 */
export function sanitizeBranchForFolder(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * WorkspaceDirectoryService handles workspace directory operations.
 * Pure directory management, no orchestration.
 */
export class WorkspaceDirectoryService {
  constructor(private fs: IFileSystem) {}

  createWorkspaceDir(destPath: string, branch: string): string {
    const workspacePath = path.join(destPath, sanitizeBranchForFolder(branch));
    if (this.fs.existsSync(workspacePath)) {
      throw new WorkspaceAlreadyExistsError(workspacePath);
    }
    this.fs.mkdirSync(workspacePath, { recursive: true });
    return workspacePath;
  }

  copyAgentsMd(sourcePath: string, workspacePath: string): void {
    const agentsPath = path.join(sourcePath, 'AGENTS.md');
    if (this.fs.existsSync(agentsPath)) {
      this.fs.copyFileSync(agentsPath, path.join(workspacePath, 'AGENTS.md'));
    }
  }

  copyDevcontainer(sourcePath: string, workspacePath: string): void {
    const devcontainerPath = path.join(sourcePath, '.devcontainer');
    if (this.fs.existsSync(devcontainerPath)) {
      this.fs.cpSync(devcontainerPath, path.join(workspacePath, '.devcontainer'), { recursive: true });
    }
  }

  detectWorkspace(cwd: string, destPath: string): string | null {
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
    if (!this.fs.existsSync(workspacePath)) {
      return null;
    }

    const configPath = path.join(workspacePath, 'flow-config.json');
    if (!this.fs.existsSync(configPath)) {
      return null;
    }

    return workspacePath;
  }

  /**
   * Returns the paths of git worktrees (repos) inside a workspace directory.
   * @example getWorktreeDirs('/workspaces/feature-123') → ['/workspaces/feature-123/repo-a', ...]
   */
  getWorktreeDirs(workspacePath: string): string[] {
    const entries = this.fs.readdirSync(workspacePath, { withFileTypes: true });
    return entries
      .filter((entry: any) => {
        if (!entry.isDirectory()) {
          return false;
        }
        // Only include directories that have a .git file or directory (git repos/worktrees)
        const gitPath = path.join(workspacePath, entry.name, '.git');
        return this.fs.existsSync(gitPath);
      })
      .map((entry: any) => path.join(workspacePath, entry.name));
  }

  /**
   * Returns all workspaces under destPath, identified by the presence of flow-config.json.
   * @example listWorkspaces('/workspaces') → [{ name: 'feature-123', path: '...', repoCount: 2 }, ...]
   */
  listWorkspaces(destPath: string): Array<{ name: string; path: string; repoCount: number }> {
    if (!this.fs.existsSync(destPath)) {
      return [];
    }

    const entries = this.fs.readdirSync(destPath, { withFileTypes: true });
    return entries
      .filter((entry: any) => {
        if (!entry.isDirectory()) return false;
        const configPath = path.join(destPath, entry.name, 'flow-config.json');
        return this.fs.existsSync(configPath);
      })
      .map((entry: any) => {
        const workspacePath = path.join(destPath, entry.name);
        try {
          const worktrees = this.getWorktreeDirs(workspacePath);
          return {
            name: entry.name,
            path: workspacePath,
            repoCount: worktrees.length,
          };
        } catch {
          return null;
        }
      })
      .filter((ws): ws is { name: string; path: string; repoCount: number } => ws !== null);
  }

  removeWorkspaceDir(workspacePath: string): void {
    this.fs.rmSync(workspacePath, { recursive: true, force: true });
  }

  findWorkspace(destPath: string, branchName: string): { name: string; path: string; repoCount: number } | null {
    const workspaces = this.listWorkspaces(destPath);
    const sanitized = sanitizeBranchForFolder(branchName);
    return workspaces.find(ws => ws.name === sanitized) || null;
  }
}
