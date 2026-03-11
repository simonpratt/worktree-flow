import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { TmuxService } from '../lib/tmux.js';

export type CreateWorkspaceParams = {
  branchName: string;
  sourcePath: string;
  destPath: string;
  tmux: boolean;
};

export type CreateWorkspaceResult = {
  workspacePath: string;
  tmuxCreated: boolean;
};

/**
 * Use case for creating a new workspace directory with initial config, AGENTS.md copy,
 * .devcontainer copy, and an optional tmux session (root pane only, no worktrees yet).
 */
export class CreateWorkspaceUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService,
    private tmux: TmuxService
  ) {}

  async execute(params: CreateWorkspaceParams): Promise<CreateWorkspaceResult> {
    // 1. Create workspace directory
    const workspacePath = this.workspaceDir.createWorkspaceDir(
      params.destPath,
      params.branchName
    );

    // 2. Save placeholder config
    this.workspaceConfig.savePlaceholder(workspacePath);

    // 3. Copy AGENTS.md if it exists in source-path
    this.workspaceDir.copyAgentsMd(params.sourcePath, workspacePath);

    // 4. Copy .devcontainer if it exists in source-path
    this.workspaceDir.copyDevcontainer(params.sourcePath, workspacePath);

    // 5. Create tmux session (root pane only) if enabled
    let tmuxCreated = false;
    if (params.tmux) {
      try {
        await this.tmux.createSession(workspacePath, params.branchName, []);
        tmuxCreated = true;
      } catch {
        // Don't fail the workspace creation, just report tmux wasn't created
      }
    }

    return {
      workspacePath,
      tmuxCreated,
    };
  }
}
