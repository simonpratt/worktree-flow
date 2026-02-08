import path from 'node:path';
import { NotInWorkspaceError, WorkspaceNotFoundError } from './errors.js';
import type { WorkspaceDirectoryService } from './workspaceDirectory.js';
import type { ConfigService } from './config.js';
import type { IProcess } from '../adapters/types.js';

export type WorkspaceResolution = {
  workspacePath: string;
  displayName: string;
};

/**
 * Resolves a workspace path from either an explicit branch name or by auto-detecting
 * from the current working directory.
 *
 * @param branchName - Optional branch name. If provided, looks for workspace with this name.
 *                     If undefined, auto-detects from current directory.
 * @param workspaceDir - WorkspaceDirectoryService instance
 * @param config - ConfigService instance
 * @param process - IProcess instance for getting cwd
 * @returns WorkspaceResolution containing the workspace path and display name
 * @throws NotInWorkspaceError if auto-detecting and cwd is outside dest-path
 * @throws WorkspaceNotFoundError if explicit branch provided but workspace doesn't exist
 */
export function resolveWorkspace(
  branchName: string | undefined,
  workspaceDir: WorkspaceDirectoryService,
  config: ConfigService,
  process: IProcess
): WorkspaceResolution {
  const { destPath } = config.getRequired();

  if (branchName) {
    // Explicit branch provided
    const workspacePath = path.join(destPath, branchName);
    const workspace = workspaceDir.findWorkspace(destPath, branchName);
    if (!workspace) {
      throw new WorkspaceNotFoundError(workspacePath);
    }
    return {
      workspacePath,
      displayName: branchName,
    };
  } else {
    // Auto-detect from current directory
    const detectedPath = workspaceDir.detectWorkspace(process.cwd(), destPath);
    if (!detectedPath) {
      throw new NotInWorkspaceError(destPath);
    }
    return {
      workspacePath: detectedPath,
      displayName: path.basename(detectedPath),
    };
  }
}
