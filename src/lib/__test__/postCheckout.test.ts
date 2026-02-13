import { describe, it, expect, vi } from 'vitest';
import { PostCheckoutService } from '../postCheckout.js';
import type { IShell } from '../../adapters/types.js';

describe('PostCheckoutService', () => {
  describe('runCommandInDirectory', () => {
    it('should run command in specified directory', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      await service.runCommandInDirectory('/workspace/repo1', 'npm install');

      expect(shell.execFile).toHaveBeenCalledTimes(1);
      expect(shell.execFile).toHaveBeenCalledWith(
        'sh',
        ['-c', 'npm install'],
        { cwd: '/workspace/repo1' }
      );
    });

    it('should handle command failures', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockRejectedValue(new Error('command failed')),
      };
      const service = new PostCheckoutService(shell);

      await expect(
        service.runCommandInDirectory('/workspace/repo1', 'npm install')
      ).rejects.toThrow('command failed');
    });
  });
});
