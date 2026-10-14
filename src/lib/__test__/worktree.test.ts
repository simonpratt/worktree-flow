import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import * as sinon from 'sinon';
import { WorktreeService } from '../worktree.js';
import { GitService } from '../git.js';
import { createMemFs, createMockShell } from '../../test/test-utils.js';

describe('WorktreeService', () => {
  let gitService: sinon.SinonStubbedInstance<GitService>;

  beforeEach(() => {
    const mockShell = createMockShell();
    gitService = sinon.createStubInstance(GitService);
  });

  describe('copyConfigFilesToWorktree', () => {
    it('should copy specified config files from source to worktree', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = '.env,.env.local';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(sourceRepoPath, '.env.local')]: 'LOCAL=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.readFileSync(path.join(worktreePath, '.env'), 'utf-8')).toBe('SECRET=value');
      expect(vol.readFileSync(path.join(worktreePath, '.env.local'), 'utf-8')).toBe('LOCAL=value');
    });

    it('should handle empty copyFiles parameter', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, '');

      expect(vol.existsSync(path.join(worktreePath, '.env'))).toBe(false);
    });

    it('should handle undefined copyFiles parameter', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, undefined);

      expect(vol.existsSync(path.join(worktreePath, '.env'))).toBe(false);
    });

    it('should skip files that do not exist in source repo', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = '.env,.env.local,.env.production';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        // .env.local and .env.production do not exist
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.existsSync(path.join(worktreePath, '.env'))).toBe(true);
      expect(vol.existsSync(path.join(worktreePath, '.env.local'))).toBe(false);
      expect(vol.existsSync(path.join(worktreePath, '.env.production'))).toBe(false);
    });

    it('should trim whitespace from file names', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = ' .env , .env.local , .env.test ';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(sourceRepoPath, '.env.local')]: 'LOCAL=value',
        [path.join(sourceRepoPath, '.env.test')]: 'TEST=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.existsSync(path.join(worktreePath, '.env'))).toBe(true);
      expect(vol.existsSync(path.join(worktreePath, '.env.local'))).toBe(true);
      expect(vol.existsSync(path.join(worktreePath, '.env.test'))).toBe(true);
    });

    it('should report copy errors instead of throwing', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/readonly/workspace/repo1';
      const copyFiles = '.env,.env.local';

      const { fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(sourceRepoPath, '.env.local')]: 'LOCAL=value',
      });
      fs.copyFileSync = sinon.stub().throws(new Error('Permission denied'));

      const service = new WorktreeService(fs, gitService as any);

      const result = service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(result.failed).toEqual([
        { file: '.env', error: 'Permission denied' },
        { file: '.env.local', error: 'Permission denied' },
      ]);
    });

    it('should create missing parent directories in the worktree for nested files', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';

      // apps/web is gitignored/untracked, so it doesn't exist in the fresh worktree
      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, 'apps', 'web', '.env')]: 'WEB=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      const result = service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, 'apps/web/.env');

      expect(vol.readFileSync(path.join(worktreePath, 'apps', 'web', '.env'), 'utf-8')).toBe('WEB=value');
      expect(result.failed).toEqual([]);
    });

    it('should handle single file without comma', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = '.env';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.readFileSync(path.join(worktreePath, '.env'), 'utf-8')).toBe('SECRET=value');
    });

    it('should handle file paths with subdirectories', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = 'config/.env';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, 'config', '.env')]: 'SECRET=value',
        [path.join(worktreePath, 'config', '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.readFileSync(path.join(worktreePath, 'config', '.env'), 'utf-8')).toBe('SECRET=value');
    });

    it('should filter out empty strings from comma-separated list', () => {
      const sourceRepoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const copyFiles = '.env,,,.env.local,';

      const { vol, fs } = createMemFs({
        [path.join(sourceRepoPath, '.env')]: 'SECRET=value',
        [path.join(sourceRepoPath, '.env.local')]: 'LOCAL=value',
        [path.join(worktreePath, '.gitkeep')]: '',
      });

      const service = new WorktreeService(fs, gitService as any);

      service.copyConfigFilesToWorktree(sourceRepoPath, worktreePath, copyFiles);

      expect(vol.existsSync(path.join(worktreePath, '.env'))).toBe(true);
      expect(vol.existsSync(path.join(worktreePath, '.env.local'))).toBe(true);
    });
  });

  describe('createWorktreeWithBranch', () => {
    it('should delegate to git service addWorktreeNewBranch', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const branchName = 'feature-123';
      const sourceBranch = 'master';

      const { fs } = createMemFs();
      gitService.addWorktreeNewBranch.resolves();

      const service = new WorktreeService(fs, gitService as any);

      await service.createWorktreeWithBranch(repoPath, worktreePath, branchName, sourceBranch);

      expect(gitService.addWorktreeNewBranch.calledOnce).toBe(true);
      expect(gitService.addWorktreeNewBranch.calledWith(
        repoPath,
        worktreePath,
        branchName,
        sourceBranch
      )).toBe(true);
    });

    it('should propagate errors from git service', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const branchName = 'feature-123';
      const sourceBranch = 'master';

      const { fs } = createMemFs();
      const error = new Error('Git error: branch already exists');
      gitService.addWorktreeNewBranch.rejects(error);

      const service = new WorktreeService(fs, gitService as any);

      await expect(
        service.createWorktreeWithBranch(repoPath, worktreePath, branchName, sourceBranch)
      ).rejects.toThrow('Git error: branch already exists');
    });
  });

  describe('createWorktreeCheckout', () => {
    it('should delegate to git service addWorktree', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const branchName = 'feature-123';

      const { fs } = createMemFs();
      gitService.addWorktree.resolves();

      const service = new WorktreeService(fs, gitService as any);

      await service.createWorktreeCheckout(repoPath, worktreePath, branchName);

      expect(gitService.addWorktree.calledOnce).toBe(true);
      expect(gitService.addWorktree.calledWith(repoPath, worktreePath, branchName)).toBe(true);
    });

    it('should propagate errors from git service', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';
      const branchName = 'feature-123';

      const { fs } = createMemFs();
      const error = new Error('Git error: branch not found');
      gitService.addWorktree.rejects(error);

      const service = new WorktreeService(fs, gitService as any);

      await expect(
        service.createWorktreeCheckout(repoPath, worktreePath, branchName)
      ).rejects.toThrow('Git error: branch not found');
    });
  });

  describe('removeWorktree', () => {
    it('should delegate to git service removeWorktree', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';

      const { fs } = createMemFs();
      gitService.removeWorktree.resolves();

      const service = new WorktreeService(fs, gitService as any);

      await service.removeWorktree(repoPath, worktreePath);

      expect(gitService.removeWorktree.calledOnce).toBe(true);
      expect(gitService.removeWorktree.calledWith(repoPath, worktreePath)).toBe(true);
    });

    it('should propagate errors from git service', async () => {
      const repoPath = '/source/repo1';
      const worktreePath = '/workspaces/feature-123/repo1';

      const { fs } = createMemFs();
      const error = new Error('Git error: worktree not found');
      gitService.removeWorktree.rejects(error);

      const service = new WorktreeService(fs, gitService as any);

      await expect(
        service.removeWorktree(repoPath, worktreePath)
      ).rejects.toThrow('Git error: worktree not found');
    });
  });
});
