import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { TmuxService } from './tmux.js';
import { createMockShell } from './test-utils.js';

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
    it('should execute tmux new-session with correct arguments', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.createSession('/workspace/feature', 'feature-branch');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'tmux',
        ['new-session', '-d', '-s', 'feature-branch', '-c', '/workspace/feature']
      );
    });

    it('should ignore duplicate session errors', async () => {
      const error: any = new Error('duplicate session: feature-branch');
      error.message = 'duplicate session: feature-branch';
      shell.execFile.rejects(error);

      await expect(service.createSession('/workspace/feature', 'feature-branch')).resolves.toBeUndefined();

      sinon.assert.calledOnce(shell.execFile);
    });

    it('should throw other errors', async () => {
      shell.execFile.rejects(new Error('tmux not found'));

      await expect(service.createSession('/workspace/feature', 'feature-branch')).rejects.toThrow('tmux not found');
    });

    it('should throw for non-duplicate session errors', async () => {
      shell.execFile.rejects(new Error('invalid option'));

      await expect(service.createSession('/workspace/feature', 'feature-branch')).rejects.toThrow('invalid option');

      sinon.assert.calledOnce(shell.execFile);
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

    it('should throw for non-session-not-found errors', async () => {
      shell.execFile.rejects(new Error('permission denied'));

      await expect(service.killSession('feature-branch')).rejects.toThrow('permission denied');

      sinon.assert.calledOnce(shell.execFile);
    });
  });
});
