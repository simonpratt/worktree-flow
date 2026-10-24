export const SESSION_MANAGER_KINDS = ['none', 'tmux', 'herdr'] as const;
export type SessionManagerKind = (typeof SESSION_MANAGER_KINDS)[number];

/** A terminal to open in a worktree, optionally running a command (e.g. post-checkout) once open. */
export type SessionPane = { path: string; command?: string };

/** Outcome of sending a pane's command. Only panes with a command are reported. */
export type PaneCommandResult = { path: string; success: boolean };

/**
 * A terminal multiplexer that holds one session per workspace, named after the
 * workspace's branch name.
 */
export interface SessionManager {
  /** Display name, e.g. "tmux" */
  readonly label: string;
  exists(name: string): Promise<boolean>;
  /**
   * Creates the session with terminals at the workspace root plus one per pane,
   * then runs each pane's command. All terminals are created before any command
   * runs, so a throw means no command was sent.
   * @throws SessionExistsError if the session already exists
   */
  create(name: string, rootPath: string, panes: SessionPane[]): Promise<PaneCommandResult[]>;
  /** Adds a terminal per pane to an existing session, then runs each pane's command. */
  addPanes(name: string, panes: SessionPane[]): Promise<PaneCommandResult[]>;
  /** Returns false if there was no session to close. */
  close(name: string): Promise<boolean>;
  /** Returns false if there was no session to rename. */
  rename(oldName: string, newName: string): Promise<boolean>;
}

export class SessionExistsError extends Error {
  constructor(name: string) {
    super(`Session already exists: ${name}`);
    this.name = 'SessionExistsError';
  }
}

/**
 * Looks up the session manager for the configured kind; 'none' has no manager.
 */
export class SessionManagers {
  constructor(private managers: Record<Exclude<SessionManagerKind, 'none'>, SessionManager>) {}

  get(kind: SessionManagerKind): SessionManager | undefined {
    return kind === 'none' ? undefined : this.managers[kind];
  }
}

/** Runs each pane's command (if any) and reports whether it was sent. */
export async function runPaneCommands(
  panes: Array<SessionPane & { target: string }>,
  run: (target: string, command: string) => Promise<void>
): Promise<PaneCommandResult[]> {
  const results: PaneCommandResult[] = [];
  for (const { path, command, target } of panes) {
    if (!command) continue;
    try {
      await run(target, command);
      results.push({ path, success: true });
    } catch {
      results.push({ path, success: false });
    }
  }
  return results;
}
