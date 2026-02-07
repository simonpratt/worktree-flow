import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RepoService } from './repos.js';
import { createMockFileSystem, createMockShell } from './test-utils.js';
import { GitService } from './git.js';

describe('RepoService', () => {
  let fs: sinon.SinonStubbedInstance<any>;
  let service: RepoService;

  beforeEach(() => {
    fs = createMockFileSystem();
    service = new RepoService(fs as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('discoverRepos', () => {
    it('should read directory with withFileTypes option', () => {
      fs.readdirSync.returns([]);

      service.discoverRepos('/source');

      sinon.assert.calledOnceWithExactly(fs.readdirSync, '/source', { withFileTypes: true });
    });

    it('should filter for directories and check for .git', () => {
      fs.readdirSync.returns([
        { name: 'repo1', isDirectory: () => true },
        { name: 'repo2', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ]);
      fs.existsSync.onFirstCall().returns(true);  // repo1/.git exists
      fs.existsSync.onSecondCall().returns(false); // repo2/.git does not exist

      const repos = service.discoverRepos('/source');

      sinon.assert.calledWith(fs.existsSync, '/source/repo1/.git');
      sinon.assert.calledWith(fs.existsSync, '/source/repo2/.git');
      expect(fs.existsSync.callCount).toBe(2);
      expect(repos).toEqual(['/source/repo1']);
    });

    it('should return sorted repo paths', () => {
      fs.readdirSync.returns([
        { name: 'zebra', isDirectory: () => true },
        { name: 'alpha', isDirectory: () => true },
        { name: 'beta', isDirectory: () => true },
      ]);
      fs.existsSync.returns(true);

      const repos = service.discoverRepos('/source');

      expect(repos).toEqual(['/source/alpha', '/source/beta', '/source/zebra']);
    });

    it('should exclude non-directory entries', () => {
      fs.readdirSync.returns([
        { name: 'repo1', isDirectory: () => true },
        { name: 'README.md', isDirectory: () => false },
        { name: 'file.txt', isDirectory: () => false },
      ]);
      fs.existsSync.returns(true);

      service.discoverRepos('/source');

      // Should only check .git for directories
      expect(fs.existsSync.callCount).toBe(1);
      sinon.assert.calledWith(fs.existsSync, '/source/repo1/.git');
    });

    it('should return empty array when no git repos found', () => {
      fs.readdirSync.returns([
        { name: 'not-a-repo', isDirectory: () => true },
      ]);
      fs.existsSync.returns(false);

      const repos = service.discoverRepos('/source');

      expect(repos).toEqual([]);
    });
  });

  describe('getRepoName', () => {
    it('should extract basename from path', () => {
      const name = RepoService.getRepoName('/source/my-repo');
      expect(name).toBe('my-repo');
    });

    it('should handle paths with trailing slashes', () => {
      const name = RepoService.getRepoName('/source/my-repo/');
      expect(name).toBe('my-repo');
    });

    it('should handle root-level paths', () => {
      const name = RepoService.getRepoName('my-repo');
      expect(name).toBe('my-repo');
    });
  });

  describe('findReposWithBranch', () => {
    let shell: sinon.SinonStubbedInstance<any>;
    let git: GitService;
    let gitStub: sinon.SinonStubbedInstance<GitService>;
    let serviceWithGit: RepoService;

    beforeEach(() => {
      shell = createMockShell();
      git = new GitService(shell as any);
      gitStub = sinon.stub(git);
      serviceWithGit = new RepoService(fs as any, gitStub as any);
    });

    it('should find repos that have the specified branch', async () => {
      gitStub.localRemoteBranchExists.onFirstCall().resolves(true);
      gitStub.localRemoteBranchExists.onSecondCall().resolves(false);
      gitStub.localRemoteBranchExists.onThirdCall().resolves(true);

      const { matching, results } = await serviceWithGit.findReposWithBranch(
        ['/source/repo1', '/source/repo2', '/source/repo3'],
        'feature'
      );

      expect(gitStub.localRemoteBranchExists.callCount).toBe(3);
      sinon.assert.calledWith(gitStub.localRemoteBranchExists, '/source/repo1', 'feature');
      sinon.assert.calledWith(gitStub.localRemoteBranchExists, '/source/repo2', 'feature');
      sinon.assert.calledWith(gitStub.localRemoteBranchExists, '/source/repo3', 'feature');

      expect(matching).toEqual(['/source/repo1', '/source/repo3']);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        repoPath: '/source/repo1',
        repoName: 'repo1',
        hasBranch: true,
      });
      expect(results[1]).toEqual({
        repoPath: '/source/repo2',
        repoName: 'repo2',
        hasBranch: false,
      });
      expect(results[2]).toEqual({
        repoPath: '/source/repo3',
        repoName: 'repo3',
        hasBranch: true,
      });
    });

    it('should handle errors when checking branch existence', async () => {
      gitStub.localRemoteBranchExists.onFirstCall().resolves(true);
      const error: any = new Error('git error');
      error.stderr = 'fatal: not a git repository';
      gitStub.localRemoteBranchExists.onSecondCall().rejects(error);

      const { matching, results } = await serviceWithGit.findReposWithBranch(
        ['/source/repo1', '/source/repo2'],
        'feature'
      );

      expect(matching).toEqual(['/source/repo1']);
      expect(results[1]).toEqual({
        repoPath: '/source/repo2',
        repoName: 'repo2',
        hasBranch: false,
        error: 'fatal: not a git repository',
      });
    });

    it('should use error message when stderr not available', async () => {
      gitStub.localRemoteBranchExists.rejects(new Error('generic error'));

      const { matching, results } = await serviceWithGit.findReposWithBranch(
        ['/source/repo1'],
        'feature'
      );

      expect(matching).toEqual([]);
      expect(results[0].error).toBe('generic error');
    });

    it('should return empty arrays for empty repo list', async () => {
      const { matching, results } = await serviceWithGit.findReposWithBranch([], 'feature');

      expect(matching).toEqual([]);
      expect(results).toEqual([]);
      sinon.assert.notCalled(gitStub.localRemoteBranchExists);
    });

    it('should throw error when git service not configured', async () => {
      const unconfiguredService = new RepoService(fs as any);

      await expect(
        unconfiguredService.findReposWithBranch(['/source/repo1'], 'feature')
      ).rejects.toThrow('RepoService not configured with git service');
    });
  });

  describe('formatRepoChoices', () => {
    it('should format repo paths as choices', () => {
      const choices = service.formatRepoChoices([
        '/source/zebra-repo',
        '/source/alpha-repo',
        '/source/beta-repo',
      ]);

      expect(choices).toEqual([
        { name: 'alpha-repo', value: '/source/alpha-repo' },
        { name: 'beta-repo', value: '/source/beta-repo' },
        { name: 'zebra-repo', value: '/source/zebra-repo' },
      ]);
    });

    it('should sort choices alphabetically by name', () => {
      const choices = service.formatRepoChoices([
        '/source/z-repo',
        '/source/a-repo',
        '/source/m-repo',
      ]);

      expect(choices[0].name).toBe('a-repo');
      expect(choices[1].name).toBe('m-repo');
      expect(choices[2].name).toBe('z-repo');
    });

    it('should handle empty repo list', () => {
      const choices = service.formatRepoChoices([]);

      expect(choices).toEqual([]);
    });

    it('should extract basename from full paths', () => {
      const choices = service.formatRepoChoices([
        '/very/long/path/to/source/my-repo',
      ]);

      expect(choices[0]).toEqual({
        name: 'my-repo',
        value: '/very/long/path/to/source/my-repo',
      });
    });

    it('should handle single repo', () => {
      const choices = service.formatRepoChoices(['/source/single-repo']);

      expect(choices).toEqual([
        { name: 'single-repo', value: '/source/single-repo' },
      ]);
    });
  });
});
