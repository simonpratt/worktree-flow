import type { IShell } from '../adapters/types.js';

/**
 * TmuxService handles tmux session operations.
 */
export class TmuxService {
  constructor(private shell: IShell) {}

  async createSession(workspacePath: string, sessionName: string, worktreePaths: string[] = []): Promise<void> {
    try {
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
        await this.shell.execFile('tmux', [
          'split-window',
          '-t',
          sessionName,
          '-c',
          worktreePath,
        ]);
      }

      // Apply tiled layout if we have multiple panes (root + worktrees)
      if (worktreePaths.length > 0) {
        await this.shell.execFile('tmux', [
          'select-layout',
          '-t',
          sessionName,
          'tiled',
        ]);
      }
    } catch (error: any) {
      // If session already exists, ignore the error
      if (!error.message?.includes('duplicate session')) {
        throw error;
      }
    }
  }

  async sendKeysToPane(sessionName: string, paneIndex: number, command: string): Promise<void> {
    await this.shell.execFile('tmux', [
      'send-keys',
      '-t',
      `${sessionName}:0.${paneIndex}`,
      command,
      'Enter',
    ]);
  }

  async addPane(sessionName: string, worktreePath: string): Promise<number> {
    await this.shell.execFile('tmux', [
      'split-window',
      '-t',
      sessionName,
      '-c',
      worktreePath,
    ]);

    const { stdout } = await this.shell.execFile('tmux', [
      'display-message',
      '-p',
      '-t',
      sessionName,
      '#{pane_index}',
    ]);

    await this.shell.execFile('tmux', [
      'select-layout',
      '-t',
      sessionName,
      'tiled',
    ]);

    return parseInt(stdout.trim(), 10);
  }

  async killSession(sessionName: string): Promise<void> {
    try {
      await this.shell.execFile('tmux', ['kill-session', '-t', sessionName]);
    } catch (error: any) {
      // If session doesn't exist, ignore the error
      if (!error.message?.includes('no such session')) {
        throw error;
      }
    }
  }
}
