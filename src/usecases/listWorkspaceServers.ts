import path from 'node:path';
import type { ServerService, Server } from '../lib/servers.js';
import type { WorkspaceDirectoryService } from '../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../lib/workspaceConfig.js';
import type { RunningPane, SessionManager } from '../lib/sessionManager.js';

export type ListWorkspaceServersParams = {
  sourcePath: string;
  destPath: string;
  /** Used to find the pane each server runs in, when it can list pane processes */
  sessions?: SessionManager;
};

export type WorkspaceServer = Server & {
  /** The workspace's branch name (which names its session), or the source repo's folder name */
  name: string;
  /** The workspace it runs in, or null when it runs in a source repo */
  workspacePath: string | null;
  /** The pane it runs in, or null if none was found */
  pane: RunningPane | null;
};

/**
 * Returns `child` relative to `parent` ('' when they're the same), or undefined if it isn't inside it.
 * @example relativeInside('/dev', '/dev/api/cmd') → 'api/cmd'
 */
function relativeInside(parent: string, child: string): string | undefined {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative.startsWith('..') || path.isAbsolute(relative) ? undefined : relative;
}

/**
 * Finds the pane a server was started from: the one whose foreground holds its
 * process group or the process itself, else the one whose shell started it in
 * the background, else one whose foreground is in its cwd.
 */
function findPane(server: Server, panes: RunningPane[]): RunningPane | null {
  return (
    panes.find(
      (pane) =>
        (server.pgid !== undefined && pane.foregroundProcessGroupId === server.pgid) ||
        pane.foregroundPids.includes(server.pid)
    ) ??
    panes.find((pane) => server.ppid !== undefined && pane.shellPid === server.ppid) ??
    panes.find((pane) => pane.foregroundCwd !== undefined && path.resolve(pane.foregroundCwd) === path.resolve(server.cwd)) ??
    null
  );
}

/**
 * Use case for listing the servers (processes listening on a port) running in a
 * workspace or a source repo. Anything running elsewhere is left out.
 */
export class ListWorkspaceServersUseCase {
  constructor(
    private servers: ServerService,
    private workspaceDir: WorkspaceDirectoryService,
    private workspaceConfig: WorkspaceConfigService
  ) {}

  async execute(params: ListWorkspaceServersParams): Promise<WorkspaceServer[]> {
    const { sourcePath, destPath, sessions } = params;
    const [listening, panes] = await Promise.all([
      this.servers.listListening(),
      sessions?.listRunningPanes?.() ?? Promise.resolve([]),
    ]);

    const found = listening.flatMap((server): WorkspaceServer[] => {
      // dest-path may sit inside source-path, so it's checked first
      if (relativeInside(destPath, server.cwd) !== undefined) {
        const workspacePath = this.workspaceDir.detectWorkspace(server.cwd, destPath);
        if (!workspacePath) return [];
        const name = this.workspaceConfig.getBranchName(workspacePath) ?? path.basename(workspacePath);
        return [{ ...server, name, workspacePath, pane: findPane(server, panes) }];
      }

      // Anything in the source-path root itself isn't in a repo
      const repo = relativeInside(sourcePath, server.cwd)?.split(path.sep)[0];
      return repo ? [{ ...server, name: repo, workspacePath: null, pane: findPane(server, panes) }] : [];
    });

    return found.sort(
      (a, b) =>
        Number(a.workspacePath === null) - Number(b.workspacePath === null) ||
        a.name.localeCompare(b.name) ||
        (a.ports[0] ?? 0) - (b.ports[0] ?? 0)
    );
  }
}
