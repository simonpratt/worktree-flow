import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { TmuxService } from '../tmux.js';
import { SessionExistsError } from '../sessionManager.js';
import { createMockShell } from '../../test/test-utils.js';

describe('TmuxService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let service: TmuxService;

  /** Each split-window returns the next pane id: %1, %2, ... */
  function stubTmux() {
    let paneCount = 0;
    shell.execFile.callsFake(async (_cmd: string, args: string[]) => {
      if (args[0] === 'split-window') {
        paneCount++;
        return { stdout: `%${paneCount}\n`, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
  }

  beforeEach(() => {
    shell = createMockShell();
    service = new TmuxService(shell as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('create', () => {
    it('should create session with root pane only when no panes provided', async () => {
      stubTmux();

      await service.create('feature-branch', '/workspace/feature', []);

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'tmux',
        ['new-session', '-d', '-s', 'feature-branch', '-c', '/workspace/feature']
      );
    });

    it('should split a tiled pane per worktree, re-tiling after every split', async () => {
      stubTmux();

      await service.create('feature-branch', '/workspace/feature', [
        { path: '/workspace/feature/repo1' },
        { path: '/workspace/feature/repo2' },
      ]);

      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['split-window', '-t', 'feature-branch', '-c', '/workspace/feature/repo1', '-P', '-F', '#{pane_id}']
      );
      sinon.assert.calledWith(
        shell.execFile,
        'tmux',
        ['split-window', '-t', 'feature-branch', '-c', '/workspace/feature/repo2', '-P', '-F', '#{pane_id}']
      );
      sinon.assert.calledWith(shell.execFile, 'tmux', ['select-layout', '-t', 'feature-branch', 'tiled']);

      const commands = shell.execFile.getCalls().map((c: any) => c.args[1][0]);
      expect(commands).toEqual([
        'new-session',
        'split-window', 'select-layout',
        'split-window', 'select-layout',
      ]);
    });

    it('should send each command to its pane by id once all panes exist', async () => {
      stubTmux();

      const results = await service.create('feature-branch', '/workspace/feature', [
        { path: '/workspace/feature/repo1', command: 'npm ci' },
        { path: '/workspace/feature/repo2' },
        { path: '/workspace/feature/repo3', command: 'make' },
      ]);

      // Pane ids work regardless of base-index / pane-base-index settings
      sinon.assert.calledWith(shell.execFile, 'tmux', ['send-keys', '-t', '%1', 'npm ci', 'Enter']);
      sinon.assert.calledWith(shell.execFile, 'tmux', ['send-keys', '-t', '%3', 'make', 'Enter']);

      const commands = shell.execFile.getCalls().map((c: any) => c.args[1][0]);
      expect(commands.indexOf('send-keys')).toBeGreaterThan(commands.lastIndexOf('split-window'));

      expect(results).toEqual([
        { path: '/workspace/feature/repo1', success: true },
        { path: '/workspace/feature/repo3', success: true },
      ]);
    });

    it('should report a command that fails to send without failing the others', async () => {
      stubTmux();
      shell.execFile.withArgs('tmux', ['send-keys', '-t', '%1', 'npm ci', 'Enter']).rejects(new Error('boom'));

      const results = await service.create('feature-branch', '/workspace/feature', [
        { path: '/workspace/feature/repo1', command: 'npm ci' },
        { path: '/workspace/feature/repo2', command: 'make' },
      ]);

      expect(results).toEqual([
        { path: '/workspace/feature/repo1', success: false },
        { path: '/workspace/feature/repo2', success: true },
      ]);
    });

    it('should throw SessionExistsError without touching the existing session', async () => {
      shell.execFile.rejects(new Error('duplicate session: feature-branch'));

      await expect(
        service.create('feature-branch', '/workspace/feature', [{ path: '/workspace/feature/repo1', command: 'npm ci' }])
      ).rejects.toBeInstanceOf(SessionExistsError);

      sinon.assert.calledOnce(shell.execFile);
    });

    it('should throw other errors', async () => {
      shell.execFile.rejects(new Error('tmux not found'));

      await expect(service.create('feature-branch', '/workspace/feature', [])).rejects.toThrow('tmux not found');
    });

    it('should throw before sending any command when a split fails', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: '', stderr: '' });
      shell.execFile.onSecondCall().rejects(new Error('no space for new pane'));

      await expect(
        service.create('feature-branch', '/workspace/feature', [{ path: '/workspace/feature/repo1', command: 'npm ci' }])
      ).rejects.toThrow('no space for new pane');

      const commands = shell.execFile.getCalls().map((c: any) => c.args[1][0]);
      expect(commands).not.toContain('send-keys');
    });
  });

  describe('addPanes', () => {
    it('should split panes into the existing session and run their commands', async () => {
      stubTmux();

      const results = await service.addPanes('feature-branch', [{ path: '/workspace/feature/repo1', command: 'npm ci' }]);

      const commands = shell.execFile.getCalls().map((c: any) => c.args[1][0]);
      expect(commands).toEqual(['split-window', 'select-layout', 'send-keys']);
      sinon.assert.calledWith(shell.execFile, 'tmux', ['send-keys', '-t', '%1', 'npm ci', 'Enter']);
      expect(results).toEqual([{ path: '/workspace/feature/repo1', success: true }]);
    });
  });

  describe('close', () => {
    it('should kill the session and report it', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await expect(service.close('feature-branch')).resolves.toBe(true);

      sinon.assert.calledOnceWithExactly(shell.execFile, 'tmux', ['kill-session', '-t', 'feature-branch']);
    });

    it('should report nothing was closed when the session does not exist', async () => {
      shell.execFile.rejects(new Error("can't find session: feature-branch"));

      await expect(service.close('feature-branch')).resolves.toBe(false);
    });

    it('should report nothing was closed when no tmux server is running', async () => {
      shell.execFile.rejects(new Error('no server running on /tmp/tmux-1000/default'));

      await expect(service.close('feature-branch')).resolves.toBe(false);
    });

    it('should throw other errors', async () => {
      shell.execFile.rejects(new Error('permission denied'));

      await expect(service.close('feature-branch')).rejects.toThrow('permission denied');
    });
  });

  describe('exists', () => {
    it('should return true when has-session succeeds', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await expect(service.exists('feature-branch')).resolves.toBe(true);

      sinon.assert.calledOnceWithExactly(shell.execFile, 'tmux', ['has-session', '-t', 'feature-branch']);
    });

    it('should return false when has-session fails', async () => {
      shell.execFile.rejects(new Error("can't find session"));

      await expect(service.exists('feature-branch')).resolves.toBe(false);
    });
  });

  describe('rename', () => {
    it('should rename an existing session', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await expect(service.rename('old-name', 'new-name')).resolves.toBe(true);

      sinon.assert.calledWith(shell.execFile, 'tmux', ['rename-session', '-t', 'old-name', 'new-name']);
    });

    it('should not rename when the session does not exist', async () => {
      shell.execFile.withArgs('tmux', ['has-session', '-t', 'old-name']).rejects(new Error("can't find session"));

      await expect(service.rename('old-name', 'new-name')).resolves.toBe(false);

      sinon.assert.calledOnce(shell.execFile);
    });
  });
});
