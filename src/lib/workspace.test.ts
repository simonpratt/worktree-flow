import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { WorkspaceService } from './workspace.js';
import { WorkspaceAlreadyExistsError } from './errors.js';
import { createMockFileSystem, createMockShell } from './test-utils.js';

describe('WorkspaceService', () => {
  let fs: sinon.SinonStubbedInstance<any>;
  let shell: sinon.SinonStubbedInstance<any>;
  let service: WorkspaceService;

  beforeEach(() => {
    fs = createMockFileSystem();
    shell = createMockShell();
    service = new WorkspaceService(fs as any, shell as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createWorkspaceDir', () => {
    it('should create workspace directory with recursive flag', () => {
      fs.existsSync.returns(false);

      const workspacePath = service.createWorkspaceDir('/dest', 'feature-branch');

      expect(workspacePath).toBe('/dest/feature-branch');
      sinon.assert.calledOnceWithExactly(fs.existsSync, '/dest/feature-branch');
      sinon.assert.calledOnceWithExactly(fs.mkdirSync, '/dest/feature-branch', { recursive: true });
    });

    it('should check if workspace exists before creating', () => {
      fs.existsSync.returns(true);

      expect(() => service.createWorkspaceDir('/dest', 'feature-branch')).toThrow(
        WorkspaceAlreadyExistsError
      );

      sinon.assert.calledOnce(fs.existsSync);
      sinon.assert.notCalled(fs.mkdirSync);
    });
  });

  describe('copyAgentsMd', () => {
    it('should check for AGENTS.md and copy if exists', () => {
      fs.existsSync.returns(true);

      service.copyAgentsMd('/source', '/workspace');

      sinon.assert.calledOnceWithExactly(fs.existsSync, '/source/AGENTS.md');
      sinon.assert.calledOnceWithExactly(
        fs.copyFileSync,
        '/source/AGENTS.md',
        '/workspace/AGENTS.md'
      );
    });

    it('should not copy if AGENTS.md does not exist', () => {
      fs.existsSync.returns(false);

      service.copyAgentsMd('/source', '/workspace');

      sinon.assert.calledOnce(fs.existsSync);
      sinon.assert.notCalled(fs.copyFileSync);
    });
  });

  describe('copyConfigFilesToWorktree', () => {
    it('should copy each file in comma-separated list', () => {
      fs.existsSync.onFirstCall().returns(true);
      fs.existsSync.onSecondCall().returns(true);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env,.env.local');

      sinon.assert.calledWith(fs.existsSync, '/source/repo/.env');
      sinon.assert.calledWith(fs.existsSync, '/source/repo/.env.local');
      sinon.assert.calledWith(fs.copyFileSync, '/source/repo/.env', '/worktree/.env');
      sinon.assert.calledWith(fs.copyFileSync, '/source/repo/.env.local', '/worktree/.env.local');
      expect(fs.copyFileSync.callCount).toBe(2);
    });

    it('should skip files that do not exist', () => {
      fs.existsSync.onFirstCall().returns(true);
      fs.existsSync.onSecondCall().returns(false);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env,.missing');

      sinon.assert.calledTwice(fs.existsSync);
      sinon.assert.calledOnce(fs.copyFileSync);
      sinon.assert.calledWith(fs.copyFileSync, '/source/repo/.env', '/worktree/.env');
    });

    it('should handle empty copyFiles string', () => {
      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '');

      sinon.assert.notCalled(fs.existsSync);
      sinon.assert.notCalled(fs.copyFileSync);
    });

    it('should handle undefined copyFiles', () => {
      service.copyConfigFilesToWorktree('/source/repo', '/worktree', undefined);

      sinon.assert.notCalled(fs.existsSync);
      sinon.assert.notCalled(fs.copyFileSync);
    });

    it('should trim whitespace from file names', () => {
      fs.existsSync.returns(true);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', ' .env , config.json ');

      sinon.assert.calledWith(fs.existsSync, '/source/repo/.env');
      sinon.assert.calledWith(fs.existsSync, '/source/repo/config.json');
    });

    it('should silently ignore copy errors', () => {
      fs.existsSync.returns(true);
      fs.copyFileSync.throws(new Error('Permission denied'));

      expect(() => {
        service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env');
      }).not.toThrow();
    });
  });

  describe('detectWorkspace', () => {
    it('should detect workspace from nested path', () => {
      fs.existsSync.returns(true);

      const workspace = service.detectWorkspace('/dest/feature-branch/repo', '/dest');

      expect(workspace).toBe('/dest/feature-branch');
      sinon.assert.calledOnceWithExactly(fs.existsSync, '/dest/feature-branch');
    });

    it('should verify workspace directory exists', () => {
      fs.existsSync.returns(false);

      const workspace = service.detectWorkspace('/dest/feature-branch/repo', '/dest');

      expect(workspace).toBeNull();
      sinon.assert.calledOnce(fs.existsSync);
    });

    it('should return null when not inside dest path', () => {
      const workspace = service.detectWorkspace('/other/path', '/dest');

      expect(workspace).toBeNull();
      sinon.assert.notCalled(fs.existsSync);
    });

    it('should return null when directly at dest path', () => {
      const workspace = service.detectWorkspace('/dest', '/dest');

      expect(workspace).toBeNull();
      sinon.assert.notCalled(fs.existsSync);
    });
  });

  describe('getWorktreeDirs', () => {
    it('should read directory and filter for directories only', () => {
      fs.readdirSync.returns([
        { name: 'repo1', isDirectory: () => true },
        { name: 'repo2', isDirectory: () => true },
        { name: 'AGENTS.md', isDirectory: () => false },
      ]);

      const worktrees = service.getWorktreeDirs('/workspace');

      sinon.assert.calledOnceWithExactly(fs.readdirSync, '/workspace', { withFileTypes: true });
      expect(worktrees).toEqual(['/workspace/repo1', '/workspace/repo2']);
    });

    it('should return empty array when no directories found', () => {
      fs.readdirSync.returns([]);

      const worktrees = service.getWorktreeDirs('/workspace');

      expect(worktrees).toEqual([]);
    });
  });

  describe('runPostCheckoutCommand', () => {
    it('should execute command in each worktree directory', async () => {
      shell.execFile.resolves({ stdout: 'success', stderr: '' });

      const count = await service.runPostCheckoutCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install'
      );

      expect(shell.execFile.callCount).toBe(2);
      sinon.assert.calledWith(
        shell.execFile.firstCall,
        'sh',
        ['-c', 'npm install'],
        { cwd: '/workspace/repo1' }
      );
      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'sh',
        ['-c', 'npm install'],
        { cwd: '/workspace/repo2' }
      );
      expect(count).toBe(2);
    });

    it('should count successes even when some commands fail', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'success', stderr: '' });
      shell.execFile.onSecondCall().rejects(new Error('npm install failed'));
      shell.execFile.onThirdCall().resolves({ stdout: 'success', stderr: '' });

      const count = await service.runPostCheckoutCommand(
        ['/workspace/repo1', '/workspace/repo2', '/workspace/repo3'],
        'npm install'
      );

      expect(count).toBe(2);
      expect(shell.execFile.callCount).toBe(3);
    });

    it('should return 0 when all commands fail', async () => {
      shell.execFile.rejects(new Error('failed'));

      const count = await service.runPostCheckoutCommand(
        ['/workspace/repo1', '/workspace/repo2'],
        'npm install'
      );

      expect(count).toBe(0);
    });
  });

  describe('listWorkspaces', () => {
    it('should read dest directory and return workspace info', () => {
      fs.existsSync.returns(true);
      fs.readdirSync.onFirstCall().returns([
        { name: 'feature-1', isDirectory: () => true },
        { name: 'feature-2', isDirectory: () => true },
      ]);
      fs.readdirSync.onSecondCall().returns([
        { name: 'repo1', isDirectory: () => true },
        { name: 'repo2', isDirectory: () => true },
      ]);
      fs.readdirSync.onThirdCall().returns([
        { name: 'repo1', isDirectory: () => true },
      ]);

      const workspaces = service.listWorkspaces('/dest');

      sinon.assert.calledWith(fs.existsSync, '/dest');
      expect(workspaces).toEqual([
        { name: 'feature-1', path: '/dest/feature-1', repoCount: 2 },
        { name: 'feature-2', path: '/dest/feature-2', repoCount: 1 },
      ]);
    });

    it('should return empty array when dest path does not exist', () => {
      fs.existsSync.returns(false);

      const workspaces = service.listWorkspaces('/nonexistent');

      sinon.assert.calledOnceWithExactly(fs.existsSync, '/nonexistent');
      expect(workspaces).toEqual([]);
    });

    it('should exclude workspaces with no repos', () => {
      fs.existsSync.returns(true);
      fs.readdirSync.onFirstCall().returns([
        { name: 'feature-1', isDirectory: () => true },
        { name: 'empty', isDirectory: () => true },
      ]);
      fs.readdirSync.onSecondCall().returns([
        { name: 'repo1', isDirectory: () => true },
      ]);
      fs.readdirSync.onThirdCall().returns([]);

      const workspaces = service.listWorkspaces('/dest');

      expect(workspaces).toEqual([
        { name: 'feature-1', path: '/dest/feature-1', repoCount: 1 },
      ]);
    });
  });

  describe('removeWorkspaceDir', () => {
    it('should remove directory with recursive and force flags', () => {
      service.removeWorkspaceDir('/workspace');

      sinon.assert.calledOnceWithExactly(fs.rmSync, '/workspace', {
        recursive: true,
        force: true,
      });
    });
  });
});
