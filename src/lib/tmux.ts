import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function createTmuxSession(
  workspacePath: string,
  sessionName: string
): Promise<void> {
  try {
    await execFileAsync('tmux', [
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
