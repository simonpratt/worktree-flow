import path from 'node:path';
import { NotInWorkspaceError, WorkspaceNotFoundError } from './errors.js';
import type { WorkspaceDirectoryService } from './workspaceDirectory.js';
import { sanitizeBranchForFolder } from './workspaceDirectory.js';
import type { WorkspaceConfigService } from './workspaceConfig.js';
import type { ConfigService } from './config.js';
import type { IProcess } from '../adapters/types.js';

export type WorkspaceResolution = {
  workspacePath: string;
  /** The workspace's real branch name (also its tmux session name), as persisted at creation. */
  displayName: string;
};

/**
 * Resolves a workspace path from either an explicit branch name or by auto-detecting
 * from the current working directory.
 *
 * @param branchName - Optional branch name. If provided, looks for workspace with this name.
 *                     If undefined, auto-detects from current directory.
 * The returned displayName is the branch name persisted in the workspace's flow-config.json,
 * since the folder name is sanitized and can differ from it (e.g. "feature/x" → "feature_x").
 * Workspaces created before the branch name was persisted fall back to the given name
 * or, when auto-detecting, the folder name.
 *
 * @param workspaceDir - WorkspaceDirectoryService instance
 * @param workspaceConfig - WorkspaceConfigService instance
 * @param config - ConfigService instance
 * @param process - IProcess instance for getting cwd
 * @returns WorkspaceResolution containing the workspace path and display name
 * @throws NotInWorkspaceError if auto-detecting and cwd is outside dest-path
 * @throws WorkspaceNotFoundError if explicit branch provided but workspace doesn't exist
 */
export function resolveWorkspace(
  branchName: string | undefined,
  workspaceDir: WorkspaceDirectoryService,
  workspaceConfig: WorkspaceConfigService,
  config: ConfigService,
  process: IProcess
): WorkspaceResolution {
  const { destPath } = config.getRequired();

  if (branchName) {
    // Explicit branch provided
    const sanitized = sanitizeBranchForFolder(branchName);
    const workspacePath = path.join(destPath, sanitized);
    const workspace = workspaceDir.findWorkspace(destPath, branchName);
    if (!workspace) {
      throw new WorkspaceNotFoundError(workspacePath);
    }
    return {
      workspacePath,
      displayName: workspaceConfig.getBranchName(workspacePath) ?? branchName,
    };
  } else {
    // Auto-detect from current directory
    const detectedPath = workspaceDir.detectWorkspace(process.cwd(), destPath);
    if (!detectedPath) {
      throw new NotInWorkspaceError(destPath);
    }
    return {
      workspacePath: detectedPath,
      displayName: workspaceConfig.getBranchName(detectedPath) ?? path.basename(detectedPath),
    };
  }
}

/**
 * Like resolveWorkspace, but returns null instead of throwing when no workspace
 * can be resolved. Useful when workspace resolution is optional (e.g. falling back
 * to a broader operation when not in a workspace).
 */
export function tryResolveWorkspace(
  branchName: string | undefined,
  workspaceDir: WorkspaceDirectoryService,
  workspaceConfig: WorkspaceConfigService,
  config: ConfigService,
  process: IProcess
): WorkspaceResolution | null {
  try {
    return resolveWorkspace(branchName, workspaceDir, workspaceConfig, config, process);
  } catch {
    return null;
  }
}
