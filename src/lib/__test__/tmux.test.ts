import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { TmuxService } from '../tmux.js';
import { createMockShell } from '../../test/test-utils.js';

describe('TmuxService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let service: TmuxService;

  beforeEach(() => {
    shell = createMockShell();
    service = new TmuxService(shell as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createSession', () => {
    it('should create session with root pane only when no worktrees provided', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.createSession('/workspace/feature', 'feature-branch', []);

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'tmux',
        ['new-session', '-d', '-s', 'feature-branch', '-c', '/workspace/feature']
      );
    });

    it('should create session with split panes for root and worktrees', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.createSession('/workspace/feature', 'feature-branch', [
        '/workspace/feature/repo1',
        '/workspace/feature/repo2'
      ]);

      // Should create base session in root
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['new-session', '-d', '-s', 'feature-branch', '-c', '/workspace/feature']
      );

      // Should split window for repo1
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['split-window', '-t', 'feature-branch', '-c', '/workspace/feature/repo1']
      );

      // Should split window for repo2
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['split-window', '-t', 'feature-branch', '-c', '/workspace/feature/repo2']
      );

      // Should apply tiled layout
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['select-layout', '-t', 'feature-branch', 'tiled']
      );

      expect(shell.execFile.callCount).toBe(4);
    });

    it('should create session with split panes for multiple worktrees', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.createSession('/workspace/feature', 'feature-branch', [
        '/workspace/feature/repo1',
        '/workspace/feature/repo2',
        '/workspace/feature/repo3',
        '/workspace/feature/repo4'
      ]);

      // Base session + 4 split-windows + select-layout = 6 calls
      expect(shell.execFile.callCount).toBe(6);

      // Verify layout is applied
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['select-layout', '-t', 'feature-branch', 'tiled']
      );
    });

    it('should ignore duplicate session errors', async () => {
      const error: any = new Error('duplicate session: feature-branch');
      error.message = 'duplicate session: feature-branch';
      shell.execFile.rejects(error);

      await expect(service.createSession('/workspace/feature', 'feature-branch', [])).resolves.toBeUndefined();

      sinon.assert.calledOnce(shell.execFile);
    });

    it('should throw other errors', async () => {
      shell.execFile.rejects(new Error('tmux not found'));

      await expect(service.createSession('/workspace/feature', 'feature-branch', [])).rejects.toThrow('tmux not found');
    });

    it('should handle split-window errors gracefully', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: '', stderr: '' });
      shell.execFile.onSecondCall().rejects(new Error('split failed'));

      await expect(
        service.createSession('/workspace/feature', 'feature-branch', ['/workspace/feature/repo1'])
      ).rejects.toThrow('split failed');
    });
  });

  describe('killSession', () => {
    it('should execute tmux kill-session with correct arguments', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.killSession('feature-branch');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'tmux',
        ['kill-session', '-t', 'feature-branch']
      );
    });

    it('should ignore session not found errors', async () => {
      const error: any = new Error('no such session: feature-branch');
      error.message = 'no such session: feature-branch';
      shell.execFile.rejects(error);

      await expect(service.killSession('feature-branch')).resolves.toBeUndefined();

      sinon.assert.calledOnce(shell.execFile);
    });

    it('should throw other errors', async () => {
      shell.execFile.rejects(new Error('tmux server not running'));

      await expect(service.killSession('feature-branch')).rejects.toThrow('tmux server not running');
    });
  });

  describe('sendKeysToPane', () => {
    it('should send command to specified pane', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.sendKeysToPane('feature-branch', 1, 'npm install');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'tmux',
        ['send-keys', '-t', 'feature-branch:0.1', 'npm install', 'Enter']
      );
    });

    it('should handle command failures', async () => {
      shell.execFile.rejects(new Error('tmux error'));

      await expect(
        service.sendKeysToPane('feature-branch', 1, 'npm install')
      ).rejects.toThrow('tmux error');
    });
  });
});
