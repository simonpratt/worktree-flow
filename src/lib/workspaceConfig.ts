import path from 'node:path';
import { z } from 'zod';
import type { IFileSystem } from '../adapters/types.js';

// Schema for workspace config
const WorkspaceConfigSchema = z.object({
  baseBranches: z.record(z.string(), z.string()),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * WorkspaceConfigService manages flow-config.json files in workspace directories.
 * These files track the base branch used for each repository in a workspace.
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

  savePlaceholder(workspacePath: string): void {
    const configPath = this.getConfigPath(workspacePath);
    this.fs.writeFileSync(configPath, JSON.stringify({ baseBranches: {} }, null, 2) + '\n');
  }

  save(workspacePath: string, config: WorkspaceConfig): void {
    const configPath = this.getConfigPath(workspacePath);
    const validated = WorkspaceConfigSchema.parse(config);
    const existing = this.load(workspacePath);
    const merged: WorkspaceConfig = {
      baseBranches: { ...existing.baseBranches, ...validated.baseBranches },
    };
    this.fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
  }

  getBaseBranch(workspacePath: string, repoName: string): string {
    const config = this.load(workspacePath);
    return config.baseBranches[repoName] || 'master';
  }
}
