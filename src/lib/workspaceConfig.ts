import path from 'node:path';
import { z } from 'zod';
import type { IFileSystem } from '../adapters/types.js';

// Schema for workspace config
const WorkspaceConfigSchema = z.object({
  /** The workspace's real (unsanitized) branch name — the folder name is sanitized, so it can't be derived from that. Absent in workspaces created before it was persisted. */
  branchName: z.string().optional(),
  baseBranches: z.record(z.string(), z.string()),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * WorkspaceConfigService manages flow-config.json files in workspace directories.
 * These files track the workspace's branch name and the base branch used for each repository in it.
 */
export class WorkspaceConfigService {
  constructor(private fs: IFileSystem) {}

  private getConfigPath(workspacePath: string): string {
    return path.join(workspacePath, 'flow-config.json');
  }

  exists(workspacePath: string): boolean {
    const configPath = this.getConfigPath(workspacePath);
    return this.fs.existsSync(configPath);
  }

  load(workspacePath: string): WorkspaceConfig {
    const configPath = this.getConfigPath(workspacePath);
    if (!this.fs.existsSync(configPath)) {
      return { baseBranches: {} };
    }
    const raw = this.fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return WorkspaceConfigSchema.parse(parsed);
  }

  savePlaceholder(workspacePath: string, branchName: string): void {
    this.write(workspacePath, { branchName, baseBranches: {} });
  }

  save(workspacePath: string, config: WorkspaceConfig): void {
    const validated = WorkspaceConfigSchema.parse(config);
    const existing = this.load(workspacePath);
    const merged: WorkspaceConfig = {
      branchName: validated.branchName ?? existing.branchName,
      baseBranches: { ...existing.baseBranches, ...validated.baseBranches },
    };
    this.write(workspacePath, merged);
  }

  getBranchName(workspacePath: string): string | undefined {
    return this.load(workspacePath).branchName;
  }

  setBranchName(workspacePath: string, branchName: string): void {
    this.write(workspacePath, { ...this.load(workspacePath), branchName });
  }

  private write(workspacePath: string, config: WorkspaceConfig): void {
    this.fs.writeFileSync(this.getConfigPath(workspacePath), JSON.stringify(config, null, 2) + '\n');
  }

  getBaseBranch(workspacePath: string, repoName: string): string {
    const config = this.load(workspacePath);
    return config.baseBranches[repoName] || 'master';
  }
}
