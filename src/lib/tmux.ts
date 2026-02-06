import type { IShell } from '../adapters/types.js';

/**
 * TmuxService handles tmux session operations.
 */
export class TmuxService {
  constructor(private shell: IShell) {}

  async createSession(workspacePath: string, sessionName: string): Promise<void> {
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
      // If session already exists, ignore the error
      if (!error.message?.includes('duplicate session')) {
        throw error;
      }
    }
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
