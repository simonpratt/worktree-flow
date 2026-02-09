import { describe, it, expect, vi } from 'vitest';
import { PostCheckoutService } from '../postCheckout.js';
import type { IShell } from '../../adapters/types.js';

describe('PostCheckoutService', () => {
  describe('runCommand', () => {
    it('should run global command in all worktrees when no per-repo config', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      const result = await service.runCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install',
        {}
      );

      expect(shell.execFile).toHaveBeenCalledTimes(2);
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'npm install'], {
        cwd: '/workspace/repo1',
      });
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'npm install'], {
        cwd: '/workspace/repo2',
      });
      expect(result).toEqual({ successCount: 2, totalCount: 2 });
    });

    it('should use per-repo command when configured', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      const perRepoCommands = {
        repo1: 'yarn install',
        repo2: 'npm run build',
      };

      const result = await service.runCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install',
        perRepoCommands
      );

      expect(shell.execFile).toHaveBeenCalledTimes(2);
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'yarn install'], {
        cwd: '/workspace/repo1',
      });
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'npm run build'], {
        cwd: '/workspace/repo2',
      });
      expect(result).toEqual({ successCount: 2, totalCount: 2 });
    });

    it('should fall back to global command for repos without per-repo config', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      const perRepoCommands = {
        repo1: 'yarn install',
      };

      const result = await service.runCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install',
        perRepoCommands
      );

      expect(shell.execFile).toHaveBeenCalledTimes(2);
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'yarn install'], {
        cwd: '/workspace/repo1',
      });
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'npm install'], {
        cwd: '/workspace/repo2',
      });
      expect(result).toEqual({ successCount: 2, totalCount: 2 });
    });

    it('should skip repos that have no global command and no per-repo command', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      const perRepoCommands = {
        repo1: 'yarn install',
      };

      const result = await service.runCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        undefined,
        perRepoCommands
      );

      expect(shell.execFile).toHaveBeenCalledTimes(1);
      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'yarn install'], {
        cwd: '/workspace/repo1',
      });
      expect(result).toEqual({ successCount: 1, totalCount: 1 });
    });

    it('should handle command failures', async () => {
      const shell: IShell = {
        execFile: vi.fn()
          .mockResolvedValueOnce({ stdout: '', stderr: '' })
          .mockRejectedValueOnce(new Error('command failed')),
      };
      const service = new PostCheckoutService(shell);

      const result = await service.runCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install',
        {}
      );

      expect(result).toEqual({ successCount: 1, totalCount: 2 });
    });

    it('should extract repo name from worktree path', async () => {
      const shell: IShell = {
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
      const service = new PostCheckoutService(shell);

      const perRepoCommands = {
        'my-repo': 'custom command',
      };

      await service.runCommand(
        ['/workspace/branch-name/my-repo'],
        'npm install',
        perRepoCommands
      );

      expect(shell.execFile).toHaveBeenCalledWith('sh', ['-c', 'custom command'], {
        cwd: '/workspace/branch-name/my-repo',
      });
    });
  });
});
