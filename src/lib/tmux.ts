import type { IShell } from '../adapters/types.js';

/**
 * TmuxService handles tmux session operations.
 */
export class TmuxService {
  // Pane splits are serialised: split-window halves the active pane, so concurrent
  // splits without a re-tile in between shrink panes until tmux runs out of space.
  private paneQueue: Promise<unknown> = Promise.resolve();

  constructor(private shell: IShell) {}

  private serialise<T>(task: () => Promise<T>): Promise<T> {
    const result = this.paneQueue.then(task);
    this.paneQueue = result.catch(() => {});
    return result;
  }

  private async splitAndTile(sessionName: string, worktreePath: string, extraArgs: string[] = []): Promise<string> {
    const { stdout } = await this.shell.execFile('tmux', [
      'split-window',
      '-t',
      sessionName,
      '-c',
      worktreePath,
      ...extraArgs,
    ]);

    // Re-tile after every split so the next split has room to work with
    await this.shell.execFile('tmux', [
      'select-layout',
      '-t',
      sessionName,
      'tiled',
    ]);

    return stdout;
  }

  /**
   * @throws if the session already exists ("duplicate session") — no panes are added to it
   */
  async createSession(workspacePath: string, sessionName: string, worktreePaths: string[] = []): Promise<void> {
    // Create base session in workspace root
    await this.shell.execFile('tmux', [
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-c',
      workspacePath,
    ]);

    // Create split panes for each worktree
    for (const worktreePath of worktreePaths) {
      await this.serialise(() => this.splitAndTile(sessionName, worktreePath));
    }
  }

  /** Targets the pane by its unique id (e.g. `%7`), so it works regardless of base-index settings. */
  async sendKeysToPane(paneId: string, command: string): Promise<void> {
    await this.shell.execFile('tmux', [
      'send-keys',
      '-t',
      paneId,
      command,
      'Enter',
    ]);
  }

  /** Returns the new pane's id (e.g. `%7`). */
  async addPane(sessionName: string, worktreePath: string): Promise<string> {
    const stdout = await this.serialise(() =>
      this.splitAndTile(sessionName, worktreePath, ['-P', '-F', '#{pane_id}'])
    );

    return stdout.trim();
  }

  /** Returns false if there was no session to kill. */
  async killSession(sessionName: string): Promise<boolean> {
    try {
      await this.shell.execFile('tmux', ['kill-session', '-t', sessionName]);
      return true;
    } catch (error: any) {
      if (/can't find session|no such session|no server running/.test(error.message ?? '')) {
        return false;
      }
      throw error;
    }
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await this.shell.execFile('tmux', ['has-session', '-t', sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  async renameSession(oldName: string, newName: string): Promise<void> {
    await this.shell.execFile('tmux', ['rename-session', '-t', oldName, newName]);
  }
}
