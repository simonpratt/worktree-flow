import path from 'node:path';
import type { IFileSystem, IShell } from '../adapters/types.js';
import { WorkspaceAlreadyExistsError, WorkspaceNotFoundError } from './errors.js';
import type { GitService } from './git.js';
import type { ParallelService } from './parallel.js';
import type { TmuxService } from './tmux.js';
import type { RepoService } from './repos.js';

export type WorkspaceCreationResult = {
  workspacePath: string;
  successCount: number;
  totalCount: number;
};

/**
 * WorkspaceService handles workspace directory operations.
 */
export class WorkspaceService {
  constructor(
    private fs: IFileSystem,
    private shell: IShell,
    private git?: GitService,
    private parallel?: ParallelService,
    private tmux?: TmuxService,
    private repos?: RepoService
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

  /**
   * Orchestration: Create worktrees for selected repos with a new branch
   */
  async createBranchWorktrees(
    selectedRepos: string[],
    destPath: string,
    branchName: string,
    sourceBranch: string,
    copyFiles?: string
  ): Promise<WorkspaceCreationResult> {
    if (!this.git || !this.parallel) {
      throw new Error('WorkspaceService not configured with required dependencies');
    }

    const workspacePath = this.createWorkspaceDir(destPath, branchName);

    const successCount = await this.parallel.processInParallel(
      selectedRepos,
      (repoPath) => path.basename(repoPath),
      async (repoPath) => {
        const name = path.basename(repoPath);
        const worktreeDest = path.join(workspacePath, name);
        await this.git!.addWorktreeNewBranch(repoPath, worktreeDest, branchName, sourceBranch);
        this.copyConfigFilesToWorktree(repoPath, worktreeDest, copyFiles);
        return 'created';
      }
    );

    return {
      workspacePath,
      successCount,
      totalCount: selectedRepos.length,
    };
  }

  /**
   * Orchestration: Create worktrees for repos that have an existing branch
   */
  async createCheckoutWorktrees(
    matchingRepos: string[],
    destPath: string,
    branchName: string,
    copyFiles?: string
  ): Promise<WorkspaceCreationResult> {
    if (!this.git || !this.parallel) {
      throw new Error('WorkspaceService not configured with required dependencies');
    }

    const workspacePath = this.createWorkspaceDir(destPath, branchName);

    const successCount = await this.parallel.processInParallel(
      matchingRepos,
      (repoPath) => path.basename(repoPath),
      async (repoPath) => {
        const name = path.basename(repoPath);
        const worktreeDest = path.join(workspacePath, name);
        await this.git!.addWorktree(repoPath, worktreeDest, branchName);
        this.copyConfigFilesToWorktree(repoPath, worktreeDest, copyFiles);
        return 'created';
      }
    );

    return {
      workspacePath,
      successCount,
      totalCount: matchingRepos.length,
    };
  }

  /**
   * Orchestration: Create tmux session with error handling
   */
  async createTmuxSession(workspacePath: string, branchName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.tmux) {
      throw new Error('WorkspaceService not configured with tmux service');
    }

    try {
      await this.tmux.createSession(workspacePath, branchName);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Orchestration: Kill tmux session with error handling
   */
  async killTmuxSession(branchName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.tmux) {
      throw new Error('WorkspaceService not configured with tmux service');
    }

    try {
      await this.tmux.killSession(branchName);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Find a workspace by name
   */
  findWorkspace(destPath: string, branchName: string): { name: string; path: string; repoCount: number } | null {
    const workspaces = this.listWorkspaces(destPath);
    return workspaces.find(ws => ws.name === branchName) || null;
  }

  /**
   * Orchestration: Remove all worktrees in a workspace
   */
  async removeWorktrees(
    worktreeDirs: string[],
    sourcePath: string
  ): Promise<{ successCount: number; totalCount: number; errors: Array<{ repo: string; error: string }> }> {
    if (!this.git || !this.repos) {
      throw new Error('WorkspaceService not configured with required dependencies');
    }

    let successCount = 0;
    const errors: Array<{ repo: string; error: string }> = [];

    for (const worktreePath of worktreeDirs) {
      const repoName = path.basename(worktreePath);
      const sourceRepoPath = path.join(sourcePath, repoName);

      try {
        const repos = this.repos.discoverRepos(sourcePath);
        if (!repos.includes(sourceRepoPath)) {
          errors.push({ repo: repoName, error: 'source repo not found' });
          continue;
        }

        await this.git.removeWorktree(sourceRepoPath, worktreePath);
        successCount++;
      } catch (err: any) {
        errors.push({ repo: repoName, error: err.stderr || err.message });
      }
    }

    return {
      successCount,
      totalCount: worktreeDirs.length,
      errors,
    };
  }
}
