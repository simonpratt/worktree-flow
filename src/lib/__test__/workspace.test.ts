import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { WorkspaceService } from '../workspace.js';
import { WorkspaceAlreadyExistsError } from '../errors.js';
import { createMemFs, createMockShell } from '../../test/test-utils.js';
import { GitService } from '../git.js';
import { ParallelService } from '../parallel.js';
import { TmuxService } from '../tmux.js';
import { RepoService } from '../repos.js';
import type { IFileSystem } from '../../adapters/types.js';

describe('WorkspaceService', () => {
  let shell: sinon.SinonStubbedInstance<any>;

  beforeEach(() => {
    shell = createMockShell();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createWorkspaceDir', () => {
    it('should create workspace directory', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspacePath = service.createWorkspaceDir('/dest', 'feature-branch');

      expect(workspacePath).toBe('/dest/feature-branch');
      expect(vol.existsSync('/dest/feature-branch')).toBe(true);
    });

    it('should throw when workspace already exists', () => {
      const { vol, fs } = createMemFs();
      vol.mkdirSync('/dest/feature-branch', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      expect(() => service.createWorkspaceDir('/dest', 'feature-branch')).toThrow(
        WorkspaceAlreadyExistsError
      );
    });
  });

  describe('copyAgentsMd', () => {
    it('should copy AGENTS.md when it exists in source', () => {
      const { vol, fs } = createMemFs({
        '/source/AGENTS.md': '# Agents\nContent here',
      });
      vol.mkdirSync('/workspace', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyAgentsMd('/source', '/workspace');

      expect(vol.readFileSync('/workspace/AGENTS.md', 'utf-8')).toBe('# Agents\nContent here');
    });

    it('should not copy if AGENTS.md does not exist', () => {
      const { vol, fs } = createMemFs();
      vol.mkdirSync('/source', { recursive: true });
      vol.mkdirSync('/workspace', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyAgentsMd('/source', '/workspace');

      expect(vol.existsSync('/workspace/AGENTS.md')).toBe(false);
    });
  });

  describe('copyConfigFilesToWorktree', () => {
    it('should copy each file in comma-separated list', () => {
      const { vol, fs } = createMemFs({
        '/source/repo/.env': 'SECRET=123',
        '/source/repo/.env.local': 'LOCAL=456',
      });
      vol.mkdirSync('/worktree', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env,.env.local');

      expect(vol.readFileSync('/worktree/.env', 'utf-8')).toBe('SECRET=123');
      expect(vol.readFileSync('/worktree/.env.local', 'utf-8')).toBe('LOCAL=456');
    });

    it('should skip files that do not exist', () => {
      const { vol, fs } = createMemFs({
        '/source/repo/.env': 'SECRET=123',
      });
      vol.mkdirSync('/worktree', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env,.missing');

      expect(vol.readFileSync('/worktree/.env', 'utf-8')).toBe('SECRET=123');
      expect(vol.existsSync('/worktree/.missing')).toBe(false);
    });

    it('should handle empty copyFiles string', () => {
      const { vol, fs } = createMemFs();
      vol.mkdirSync('/worktree', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', '');

      expect(vol.readdirSync('/worktree')).toEqual([]);
    });

    it('should handle undefined copyFiles', () => {
      const { vol, fs } = createMemFs();
      vol.mkdirSync('/worktree', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', undefined);

      expect(vol.readdirSync('/worktree')).toEqual([]);
    });

    it('should trim whitespace from file names', () => {
      const { vol, fs } = createMemFs({
        '/source/repo/.env': 'SECRET=123',
        '/source/repo/config.json': '{"key": "value"}',
      });
      vol.mkdirSync('/worktree', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      service.copyConfigFilesToWorktree('/source/repo', '/worktree', ' .env , config.json ');

      expect(vol.readFileSync('/worktree/.env', 'utf-8')).toBe('SECRET=123');
      expect(vol.readFileSync('/worktree/config.json', 'utf-8')).toBe('{"key": "value"}');
    });

    it('should silently ignore copy errors', () => {
      const { fs } = createMemFs({
        '/source/repo/.env': 'SECRET=123',
        // /worktree does NOT exist, so copyFileSync will fail
      });
      const service = new WorkspaceService(fs, shell as any);

      expect(() => {
        service.copyConfigFilesToWorktree('/source/repo', '/worktree', '.env');
      }).not.toThrow();
    });
  });

  describe('detectWorkspace', () => {
    it('should detect workspace from nested path', () => {
      const { fs } = createMemFs({
        '/dest/feature-branch/repo/.keep': '',
      });
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.detectWorkspace('/dest/feature-branch/repo', '/dest');

      expect(workspace).toBe('/dest/feature-branch');
    });

    it('should return null when workspace directory does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.detectWorkspace('/dest/feature-branch/repo', '/dest');

      expect(workspace).toBeNull();
    });

    it('should return null when not inside dest path', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.detectWorkspace('/other/path', '/dest');

      expect(workspace).toBeNull();
    });

    it('should return null when directly at dest path', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.detectWorkspace('/dest', '/dest');

      expect(workspace).toBeNull();
    });
  });

  describe('getWorktreeDirs', () => {
    it('should read directory and filter for directories only', () => {
      const { fs } = createMemFs({
        '/workspace/repo1/.keep': '',
        '/workspace/repo2/.keep': '',
        '/workspace/AGENTS.md': 'content',
      });
      const service = new WorkspaceService(fs, shell as any);

      const worktrees = service.getWorktreeDirs('/workspace');

      expect(worktrees).toEqual(['/workspace/repo1', '/workspace/repo2']);
    });

    it('should return empty array when no directories found', () => {
      const { vol, fs } = createMemFs();
      vol.mkdirSync('/workspace', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      const worktrees = service.getWorktreeDirs('/workspace');

      expect(worktrees).toEqual([]);
    });
  });

  describe('runPostCheckoutCommand', () => {
    it('should execute command in each worktree directory', async () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);
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
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);
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
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);
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
      const { fs } = createMemFs({
        '/dest/feature-1/repo1/.keep': '',
        '/dest/feature-1/repo2/.keep': '',
        '/dest/feature-2/repo1/.keep': '',
      });
      const service = new WorkspaceService(fs, shell as any);

      const workspaces = service.listWorkspaces('/dest');

      expect(workspaces).toEqual([
        { name: 'feature-1', path: '/dest/feature-1', repoCount: 2 },
        { name: 'feature-2', path: '/dest/feature-2', repoCount: 1 },
      ]);
    });

    it('should return empty array when dest path does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspaces = service.listWorkspaces('/nonexistent');

      expect(workspaces).toEqual([]);
    });

    it('should exclude workspaces with no repos', () => {
      const { vol, fs } = createMemFs({
        '/dest/feature-1/repo1/.keep': '',
      });
      vol.mkdirSync('/dest/empty', { recursive: true });
      const service = new WorkspaceService(fs, shell as any);

      const workspaces = service.listWorkspaces('/dest');

      expect(workspaces).toEqual([
        { name: 'feature-1', path: '/dest/feature-1', repoCount: 1 },
      ]);
    });

    it('should handle errors when reading workspace contents', () => {
      const { fs } = createMemFs({
        '/dest/feature-1/repo1/.keep': '',
        '/dest/feature-2/repo1/.keep': '',
      });
      const service = new WorkspaceService(fs, shell as any);
      const original = service.getWorktreeDirs.bind(service);
      sinon.stub(service, 'getWorktreeDirs').callsFake((wsPath: string) => {
        if (wsPath.includes('feature-2')) {
          throw new Error('read error');
        }
        return original(wsPath);
      });

      const workspaces = service.listWorkspaces('/dest');

      expect(workspaces).toEqual([
        { name: 'feature-1', path: '/dest/feature-1', repoCount: 1 },
      ]);
    });
  });

  describe('removeWorkspaceDir', () => {
    it('should remove directory recursively', () => {
      const { vol, fs } = createMemFs({
        '/workspace/repo1/file.txt': 'content',
        '/workspace/repo2/file.txt': 'content',
      });
      const service = new WorkspaceService(fs, shell as any);

      service.removeWorkspaceDir('/workspace');

      expect(vol.existsSync('/workspace')).toBe(false);
    });
  });

  describe('findWorkspace', () => {
    it('should find workspace by name', () => {
      const { fs } = createMemFs({
        '/dest/feature-1/repo1/.keep': '',
        '/dest/feature-2/repo1/.keep': '',
      });
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.findWorkspace('/dest', 'feature-2');

      expect(workspace).toEqual({
        name: 'feature-2',
        path: '/dest/feature-2',
        repoCount: 1,
      });
    });

    it('should return null when workspace not found', () => {
      const { fs } = createMemFs({
        '/dest/feature-1/repo1/.keep': '',
      });
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.findWorkspace('/dest', 'nonexistent');

      expect(workspace).toBeNull();
    });

    it('should return null when destPath does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceService(fs, shell as any);

      const workspace = service.findWorkspace('/dest', 'feature-1');

      expect(workspace).toBeNull();
    });
  });

  describe('Orchestration methods', () => {
    let gitStub: sinon.SinonStubbedInstance<GitService>;
    let parallelStub: sinon.SinonStubbedInstance<ParallelService>;
    let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;
    let reposStub: sinon.SinonStubbedInstance<RepoService>;

    beforeEach(() => {
      gitStub = sinon.createStubInstance(GitService);
      parallelStub = sinon.createStubInstance(ParallelService);
      tmuxStub = sinon.createStubInstance(TmuxService);
      reposStub = sinon.createStubInstance(RepoService);
    });

    function createOrchestratedService(fs: IFileSystem) {
      return new WorkspaceService(
        fs, shell as any, gitStub as any, parallelStub as any, tmuxStub as any, reposStub as any
      );
    }

    describe('createBranchWorktrees', () => {
      it('should create workspace and process repos in parallel', async () => {
        const { vol, fs } = createMemFs();
        const service = createOrchestratedService(fs);
        parallelStub.processInParallel.resolves(2);

        const result = await service.createBranchWorktrees(
          ['/source/repo1', '/source/repo2'],
          '/dest',
          'feature',
          'master',
          '.env'
        );

        expect(vol.existsSync('/dest/feature')).toBe(true);
        sinon.assert.calledOnce(parallelStub.processInParallel);
        expect(result).toEqual({
          workspacePath: '/dest/feature',
          successCount: 2,
          totalCount: 2,
        });
      });

      it('should call addWorktreeNewBranch for each repo', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await service.createBranchWorktrees(
          ['/source/repo1'],
          '/dest',
          'feature',
          'master',
          '.env'
        );

        // Execute the process function manually
        await processFunc('/source/repo1');

        sinon.assert.calledOnce(gitStub.addWorktreeNewBranch);
        sinon.assert.calledWith(
          gitStub.addWorktreeNewBranch,
          '/source/repo1',
          '/dest/feature/repo1',
          'feature',
          'master'
        );
      });

      it('should copy config files to worktree after creation', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        const copySpy = sinon.spy(service, 'copyConfigFilesToWorktree');

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await service.createBranchWorktrees(
          ['/source/repo1'],
          '/dest',
          'feature',
          'master',
          '.env'
        );

        await processFunc('/source/repo1');

        sinon.assert.calledOnce(copySpy);
        sinon.assert.calledWith(copySpy, '/source/repo1', '/dest/feature/repo1', '.env');
      });

      it('should throw error when dependencies not configured', async () => {
        const { fs } = createMemFs();
        const unconfiguredService = new WorkspaceService(fs, shell as any);

        await expect(
          unconfiguredService.createBranchWorktrees(
            ['/source/repo1'],
            '/dest',
            'feature',
            'master'
          )
        ).rejects.toThrow('WorkspaceService not configured with required dependencies');
      });
    });

    describe('createCheckoutWorktrees', () => {
      it('should create workspace and checkout existing branches', async () => {
        const { vol, fs } = createMemFs();
        const service = createOrchestratedService(fs);
        parallelStub.processInParallel.resolves(3);

        const result = await service.createCheckoutWorktrees(
          ['/source/repo1', '/source/repo2', '/source/repo3'],
          '/dest',
          'existing-feature',
          '.env,.env.local'
        );

        expect(vol.existsSync('/dest/existing-feature')).toBe(true);
        sinon.assert.calledOnce(parallelStub.processInParallel);
        expect(result).toEqual({
          workspacePath: '/dest/existing-feature',
          successCount: 3,
          totalCount: 3,
        });
      });

      it('should call addWorktree for each repo', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await service.createCheckoutWorktrees(
          ['/source/repo1'],
          '/dest',
          'feature',
          '.env'
        );

        await processFunc('/source/repo1');

        sinon.assert.calledOnce(gitStub.addWorktree);
        sinon.assert.calledWith(
          gitStub.addWorktree,
          '/source/repo1',
          '/dest/feature/repo1',
          'feature'
        );
      });

      it('should copy config files to worktree after checkout', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        const copySpy = sinon.spy(service, 'copyConfigFilesToWorktree');

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await service.createCheckoutWorktrees(
          ['/source/repo1'],
          '/dest',
          'feature',
          '.env'
        );

        await processFunc('/source/repo1');

        sinon.assert.calledOnce(copySpy);
        sinon.assert.calledWith(copySpy, '/source/repo1', '/dest/feature/repo1', '.env');
      });

      it('should throw error when dependencies not configured', async () => {
        const { fs } = createMemFs();
        const unconfiguredService = new WorkspaceService(fs, shell as any);

        await expect(
          unconfiguredService.createCheckoutWorktrees(
            ['/source/repo1'],
            '/dest',
            'feature'
          )
        ).rejects.toThrow('WorkspaceService not configured with required dependencies');
      });
    });

    describe('createTmuxSession', () => {
      it('should create tmux session and return success', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        tmuxStub.createSession.resolves();

        const result = await service.createTmuxSession('/workspace', 'feature');

        sinon.assert.calledOnceWithExactly(tmuxStub.createSession, '/workspace', 'feature');
        expect(result).toEqual({ success: true });
      });

      it('should catch errors and return failure with message', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        tmuxStub.createSession.rejects(new Error('tmux not found'));

        const result = await service.createTmuxSession('/workspace', 'feature');

        expect(result).toEqual({ success: false, error: 'tmux not found' });
      });

      it('should throw error when tmux service not configured', async () => {
        const { fs } = createMemFs();
        const unconfiguredService = new WorkspaceService(fs, shell as any);

        await expect(
          unconfiguredService.createTmuxSession('/workspace', 'feature')
        ).rejects.toThrow('WorkspaceService not configured with tmux service');
      });
    });

    describe('killTmuxSession', () => {
      it('should kill tmux session and return success', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        tmuxStub.killSession.resolves();

        const result = await service.killTmuxSession('feature');

        sinon.assert.calledOnceWithExactly(tmuxStub.killSession, 'feature');
        expect(result).toEqual({ success: true });
      });

      it('should catch errors and return failure with message', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        tmuxStub.killSession.rejects(new Error('session not found'));

        const result = await service.killTmuxSession('feature');

        expect(result).toEqual({ success: false, error: 'session not found' });
      });

      it('should throw error when tmux service not configured', async () => {
        const { fs } = createMemFs();
        const unconfiguredService = new WorkspaceService(fs, shell as any);

        await expect(
          unconfiguredService.killTmuxSession('feature')
        ).rejects.toThrow('WorkspaceService not configured with tmux service');
      });
    });

    describe('removeWorktrees', () => {
      it('should remove all worktrees and track success', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        reposStub.discoverRepos.returns(['/source/repo1', '/source/repo2']);
        gitStub.removeWorktree.resolves();

        const result = await service.removeWorktrees(
          ['/workspace/repo1', '/workspace/repo2'],
          '/source'
        );

        expect(gitStub.removeWorktree.callCount).toBe(2);
        sinon.assert.calledWith(gitStub.removeWorktree, '/source/repo1', '/workspace/repo1');
        sinon.assert.calledWith(gitStub.removeWorktree, '/source/repo2', '/workspace/repo2');
        expect(result).toEqual({
          successCount: 2,
          totalCount: 2,
          errors: [],
        });
      });

      it('should track errors when worktree removal fails', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        reposStub.discoverRepos.returns(['/source/repo1']);
        const error: any = new Error('worktree removal failed');
        error.stderr = 'fatal: worktree locked';
        gitStub.removeWorktree.rejects(error);

        const result = await service.removeWorktrees(
          ['/workspace/repo1'],
          '/source'
        );

        expect(result).toEqual({
          successCount: 0,
          totalCount: 1,
          errors: [{ repo: 'repo1', error: 'fatal: worktree locked' }],
        });
      });

      it('should skip worktrees when source repo not found', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        reposStub.discoverRepos.returns([]);

        const result = await service.removeWorktrees(
          ['/workspace/repo1'],
          '/source'
        );

        sinon.assert.notCalled(gitStub.removeWorktree);
        expect(result).toEqual({
          successCount: 0,
          totalCount: 1,
          errors: [{ repo: 'repo1', error: 'source repo not found' }],
        });
      });

      it('should handle mix of successes and failures', async () => {
        const { fs } = createMemFs();
        const service = createOrchestratedService(fs);
        reposStub.discoverRepos.returns(['/source/repo1', '/source/repo2']);
        gitStub.removeWorktree.onFirstCall().resolves();
        gitStub.removeWorktree.onSecondCall().rejects(new Error('failed'));

        const result = await service.removeWorktrees(
          ['/workspace/repo1', '/workspace/repo2'],
          '/source'
        );

        expect(result.successCount).toBe(1);
        expect(result.totalCount).toBe(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual({ repo: 'repo2', error: 'failed' });
      });

      it('should throw error when dependencies not configured', async () => {
        const { fs } = createMemFs();
        const unconfiguredService = new WorkspaceService(fs, shell as any);

        await expect(
          unconfiguredService.removeWorktrees(
            ['/workspace/repo1'],
            '/source'
          )
        ).rejects.toThrow('WorkspaceService not configured with required dependencies');
      });
    });
  });
});
