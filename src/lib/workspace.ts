import path from 'node:path';
import type { IFileSystem, IShell } from '../adapters/types.js';
import { WorkspaceAlreadyExistsError } from './errors.js';

/**
 * WorkspaceService handles workspace directory operations.
 */
export class WorkspaceService {
  constructor(
    private fs: IFileSystem,
    private shell: IShell
  ) {}

  createWorkspaceDir(destPath: string, branch: string): string {
    const workspacePath = path.join(destPath, branch);
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

  copyConfigFilesToWorktree(
    sourceRepoPath: string,
    worktreePath: string,
    copyFiles?: string
  ): void {
    // Default to no files if not specified
    const files = (copyFiles || '')
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    // Copy each config file from source repo to worktree
    for (const file of files) {
      const sourceFilePath = path.join(sourceRepoPath, file);
      const destFilePath = path.join(worktreePath, file);

      // Skip if file doesn't exist in source repo
      if (!this.fs.existsSync(sourceFilePath)) {
        continue;
      }

      // Copy file to worktree
      try {
        this.fs.copyFileSync(sourceFilePath, destFilePath);
      } catch {
        // Silently ignore copy errors
      }
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

    return workspacePath;
  }

  getWorktreeDirs(workspacePath: string): string[] {
    const entries = this.fs.readdirSync(workspacePath, { withFileTypes: true });
    return entries
      .filter((entry: any) => entry.isDirectory())
      .map((entry: any) => path.join(workspacePath, entry.name));
  }

  async runPostCheckoutCommand(
    worktreeDirs: string[],
    command: string
  ): Promise<number> {
    let successCount = 0;

    await Promise.allSettled(
      worktreeDirs.map(async (worktreeDir) => {
        try {
          await this.shell.execFile('sh', ['-c', command], { cwd: worktreeDir });
          successCount++;
        } catch {
          // Error handled by caller
        }
      })
    );

    return successCount;
  }

  listWorkspaces(destPath: string): Array<{ name: string; path: string; repoCount: number }> {
    if (!this.fs.existsSync(destPath)) {
      return [];
    }

    const entries = this.fs.readdirSync(destPath, { withFileTypes: true });
    return entries
      .filter((entry: any) => entry.isDirectory())
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
      .filter((ws): ws is { name: string; path: string; repoCount: number } => ws !== null && ws.repoCount > 0);
  }

  removeWorkspaceDir(workspacePath: string): void {
    this.fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}
