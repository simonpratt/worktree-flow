import type { IShell } from '../adapters/types.js';
import {
  SessionExistsError,
  runPaneCommands,
  type PaneCommandResult,
  type SessionManager,
  type SessionPane,
} from './sessionManager.js';

/**
 * Exact-match session target. A bare name also matches any one session it's a
 * prefix of, so "feat" would resolve to "feat-login" when there's no "feat".
 */
const sessionTarget = (name: string) => `=${name}`;

/** Exact-match target for a session's current window (for window/pane commands). */
const windowTarget = (name: string) => `=${name}:`;

/**
 * Tmux sessions: one window holding a pane at the workspace root plus one per
 * worktree, in a tiled layout.
 */
export class TmuxService implements SessionManager {
  readonly label = 'tmux';

  constructor(private shell: IShell) {}

  /** Splits a new pane and returns its id (e.g. `%7`). */
  private async splitAndTile(sessionName: string, worktreePath: string): Promise<string> {
    const { stdout } = await this.shell.execFile('tmux', [
      'split-window',
      '-t',
      windowTarget(sessionName),
      '-c',
      worktreePath,
      '-P',
      '-F',
      '#{pane_id}',
    ]);

    // Re-tile after every split so the next split has room to work with
    await this.shell.execFile('tmux', [
      'select-layout',
      '-t',
      windowTarget(sessionName),
      'tiled',
    ]);

    return stdout.trim();
  }

  async create(sessionName: string, workspacePath: string, panes: SessionPane[]): Promise<PaneCommandResult[]> {
    try {
      await this.shell.execFile('tmux', [
        'new-session',
        '-d',
        '-s',
        sessionName,
        '-c',
        workspacePath,
      ]);
    } catch (error: any) {
      if (error.message?.includes('duplicate session')) {
        throw new SessionExistsError(sessionName);
      }
      throw error;
    }

    return this.addPanes(sessionName, panes);
  }

  async addPanes(sessionName: string, panes: SessionPane[]): Promise<PaneCommandResult[]> {
    const targets: Array<SessionPane & { target: string }> = [];
    for (const pane of panes) {
      targets.push({ ...pane, target: await this.splitAndTile(sessionName, pane.path) });
    }
    return runPaneCommands(targets, (paneId, command) => this.sendKeys(paneId, command));
  }

  /** Targets the pane by its unique id, so it works regardless of base-index settings. */
  private async sendKeys(paneId: string, command: string): Promise<void> {
    await this.shell.execFile('tmux', ['send-keys', '-t', paneId, command, 'Enter']);
  }

  async close(sessionName: string): Promise<boolean> {
    try {
      await this.shell.execFile('tmux', ['kill-session', '-t', sessionTarget(sessionName)]);
      return true;
    } catch (error: any) {
      if (/can't find session|no such session|no server running/.test(error.message ?? '')) {
        return false;
      }
      throw error;
    }
  }

  async exists(sessionName: string): Promise<boolean> {
    try {
      await this.shell.execFile('tmux', ['has-session', '-t', sessionTarget(sessionName)]);
      return true;
    } catch {
      return false;
    }
  }

  async rename(oldName: string, newName: string): Promise<boolean> {
    if (!(await this.exists(oldName))) {
      return false;
    }
    await this.shell.execFile('tmux', ['rename-session', '-t', sessionTarget(oldName), newName]);
    return true;
  }

  async focus(sessionName: string): Promise<void> {
    await this.shell.execFile('tmux', ['switch-client', '-t', sessionTarget(sessionName)]);
  }

  /** tmux sets TMUX in every pane it starts. */
  isInside(env: (name: string) => string | undefined): boolean {
    return !!env('TMUX');
  }
}
