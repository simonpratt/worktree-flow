import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { TmuxService } from '../lib/tmux.js';

export type CreateWorkspaceParams = {
  branchName: string;
  sourcePath: string;
  destPath: string;
  tmux: boolean;
  /** Repo folder names under source-path not included in this workspace; lines mentioning them are stripped from AGENTS.md. */
  excludedFolderNames?: string[];
};

export type CreateWorkspaceResult = {
  workspacePath: string;
  tmuxCreated: boolean;
};

/**
 * Use case for creating a new workspace directory with initial config, root .md file copies,
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

    // 2. Save placeholder config, persisting the real branch name (the folder name is sanitized)
    this.workspaceConfig.savePlaceholder(workspacePath, params.branchName);

    // 3. Copy AGENTS.md if it exists in source-path, stripping lines about excluded repos
    this.workspaceDir.copyAgentsMd(
      params.sourcePath,
      workspacePath,
      params.excludedFolderNames ?? []
    );

    // 3b. Copy all other top-level .md files from source-path
    this.workspaceDir.copyRootMarkdownFiles(params.sourcePath, workspacePath);

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
