import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { SessionManager } from '../lib/sessionManager.js';

export type ListWorkspaceSessionsParams = {
  sessions: SessionManager;
  destPath: string;
};

export type WorkspaceSession = {
  path: string;
  /** The workspace's branch name, which names its session */
  sessionName: string;
  hasSession: boolean;
};

/**
 * Use case for listing every workspace with whether its session is open.
 */
export class ListWorkspaceSessionsUseCase {
  constructor(
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService
  ) {}

  async execute(params: ListWorkspaceSessionsParams): Promise<WorkspaceSession[]> {
    const workspaces = this.workspaceDir.listWorkspaces(params.destPath);

    return Promise.all(
      workspaces.map(async (workspace) => {
        // Sessions are named after the workspace's real branch name (as at creation),
        // falling back to the folder name for workspaces that predate it being persisted
        const sessionName = this.workspaceConfig.getBranchName(workspace.path) ?? workspace.name;
        return {
          path: workspace.path,
          sessionName,
          hasSession: await params.sessions.exists(sessionName),
        };
      })
    );
  }
}
