import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { WorkspaceService } from './workspace.js';
import { WorkspaceAlreadyExistsError } from './errors.js';
import { createMockFileSystem, createMockShell } from './test-utils.js';
import { GitService } from './git.js';
import { ParallelService } from './parallel.js';
import { TmuxService } from './tmux.js';
import { RepoService } from './repos.js';

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

  describe('findWorkspace', () => {
    it('should find workspace by name', () => {
      fs.existsSync.returns(true);
      fs.readdirSync.onFirstCall().returns([
        { name: 'feature-1', isDirectory: () => true },
        { name: 'feature-2', isDirectory: () => true },
      ]);
      fs.readdirSync.onSecondCall().returns([
        { name: 'repo1', isDirectory: () => true },
      ]);
      fs.readdirSync.onThirdCall().returns([
        { name: 'repo1', isDirectory: () => true },
      ]);

      const workspace = service.findWorkspace('/dest', 'feature-2');

      expect(workspace).toEqual({
        name: 'feature-2',
        path: '/dest/feature-2',
        repoCount: 1,
      });
    });

    it('should return null when workspace not found', () => {
      fs.existsSync.returns(true);
      fs.readdirSync.onFirstCall().returns([
        { name: 'feature-1', isDirectory: () => true },
      ]);
      fs.readdirSync.onSecondCall().returns([
        { name: 'repo1', isDirectory: () => true },
      ]);

      const workspace = service.findWorkspace('/dest', 'nonexistent');

      expect(workspace).toBeNull();
    });

    it('should return null when destPath does not exist', () => {
      fs.existsSync.returns(false);

      const workspace = service.findWorkspace('/dest', 'feature-1');

      expect(workspace).toBeNull();
    });
  });

  describe('Orchestration methods', () => {
    let gitStub: sinon.SinonStubbedInstance<GitService>;
    let parallelStub: sinon.SinonStubbedInstance<ParallelService>;
    let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;
    let reposStub: sinon.SinonStubbedInstance<RepoService>;
    let orchestratedService: WorkspaceService;

    beforeEach(() => {
      gitStub = sinon.createStubInstance(GitService);
      parallelStub = sinon.createStubInstance(ParallelService);
      tmuxStub = sinon.createStubInstance(TmuxService);
      reposStub = sinon.createStubInstance(RepoService);
      orchestratedService = new WorkspaceService(
        fs as any,
        shell as any,
        gitStub as any,
        parallelStub as any,
        tmuxStub as any,
        reposStub as any
      );
    });

    describe('createBranchWorktrees', () => {
      it('should create workspace and process repos in parallel', async () => {
        fs.existsSync.returns(false);
        parallelStub.processInParallel.resolves(2);

        const result = await orchestratedService.createBranchWorktrees(
          ['/source/repo1', '/source/repo2'],
          '/dest',
          'feature',
          'master',
          '.env'
        );

        sinon.assert.calledOnce(fs.mkdirSync);
        sinon.assert.calledOnce(parallelStub.processInParallel);
        expect(result).toEqual({
          workspacePath: '/dest/feature',
          successCount: 2,
          totalCount: 2,
        });
      });

      it('should call addWorktreeNewBranch for each repo', async () => {
        fs.existsSync.returns(false);

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await orchestratedService.createBranchWorktrees(
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

      it('should throw error when dependencies not configured', async () => {
        const unconfiguredService = new WorkspaceService(fs as any, shell as any);

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
        fs.existsSync.returns(false);
        parallelStub.processInParallel.resolves(3);

        const result = await orchestratedService.createCheckoutWorktrees(
          ['/source/repo1', '/source/repo2', '/source/repo3'],
          '/dest',
          'existing-feature',
          '.env,.env.local'
        );

        sinon.assert.calledOnce(fs.mkdirSync);
        sinon.assert.calledOnce(parallelStub.processInParallel);
        expect(result).toEqual({
          workspacePath: '/dest/existing-feature',
          successCount: 3,
          totalCount: 3,
        });
      });

      it('should call addWorktree for each repo', async () => {
        fs.existsSync.returns(false);

        let processFunc: any;
        parallelStub.processInParallel.callsFake(async (items: any[], nameFunc: any, func: any) => {
          processFunc = func;
          return 1;
        });

        await orchestratedService.createCheckoutWorktrees(
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
    });

    describe('createTmuxSession', () => {
      it('should create tmux session and return success', async () => {
        tmuxStub.createSession.resolves();

        const result = await orchestratedService.createTmuxSession('/workspace', 'feature');

        sinon.assert.calledOnceWithExactly(tmuxStub.createSession, '/workspace', 'feature');
        expect(result).toEqual({ success: true });
      });

      it('should catch errors and return failure with message', async () => {
        tmuxStub.createSession.rejects(new Error('tmux not found'));

        const result = await orchestratedService.createTmuxSession('/workspace', 'feature');

        expect(result).toEqual({ success: false, error: 'tmux not found' });
      });

      it('should throw error when tmux service not configured', async () => {
        const unconfiguredService = new WorkspaceService(fs as any, shell as any);

        await expect(
          unconfiguredService.createTmuxSession('/workspace', 'feature')
        ).rejects.toThrow('WorkspaceService not configured with tmux service');
      });
    });

    describe('killTmuxSession', () => {
      it('should kill tmux session and return success', async () => {
        tmuxStub.killSession.resolves();

        const result = await orchestratedService.killTmuxSession('feature');

        sinon.assert.calledOnceWithExactly(tmuxStub.killSession, 'feature');
        expect(result).toEqual({ success: true });
      });

      it('should catch errors and return failure with message', async () => {
        tmuxStub.killSession.rejects(new Error('session not found'));

        const result = await orchestratedService.killTmuxSession('feature');

        expect(result).toEqual({ success: false, error: 'session not found' });
      });
    });

    describe('removeWorktrees', () => {
      it('should remove all worktrees and track success', async () => {
        fs.readdirSync.returns([
          { name: 'repo1', isDirectory: () => true },
          { name: 'repo2', isDirectory: () => true },
        ]);
        reposStub.discoverRepos.returns(['/source/repo1', '/source/repo2']);
        gitStub.removeWorktree.resolves();

        const result = await orchestratedService.removeWorktrees(
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
        fs.readdirSync.returns([
          { name: 'repo1', isDirectory: () => true },
        ]);
        reposStub.discoverRepos.returns(['/source/repo1']);
        const error: any = new Error('worktree removal failed');
        error.stderr = 'fatal: worktree locked';
        gitStub.removeWorktree.rejects(error);

        const result = await orchestratedService.removeWorktrees(
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
        reposStub.discoverRepos.returns([]);

        const result = await orchestratedService.removeWorktrees(
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
        fs.readdirSync.returns([
          { name: 'repo1', isDirectory: () => true },
          { name: 'repo2', isDirectory: () => true },
        ]);
        reposStub.discoverRepos.returns(['/source/repo1', '/source/repo2']);
        gitStub.removeWorktree.onFirstCall().resolves();
        gitStub.removeWorktree.onSecondCall().rejects(new Error('failed'));

        const result = await orchestratedService.removeWorktrees(
          ['/workspace/repo1', '/workspace/repo2'],
          '/source'
        );

        expect(result.successCount).toBe(1);
        expect(result.totalCount).toBe(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual({ repo: 'repo2', error: 'failed' });
      });
    });
  });
});
