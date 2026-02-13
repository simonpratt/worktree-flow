import type { IShell } from '../adapters/types.js';

/**
 * PostCheckoutService handles execution of post-checkout commands.
 */
export class PostCheckoutService {
  constructor(private shell: IShell) {}

  async runCommandInDirectory(directory: string, command: string): Promise<void> {
    await this.shell.execFile('sh', ['-c', command], { cwd: directory });
  }
}
