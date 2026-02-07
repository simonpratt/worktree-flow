import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RepoService } from '../repos.js';
import { createMemFs, createMockShell } from '../../test/test-utils.js';
import { GitService } from '../git.js';

describe('RepoService', () => {
  describe('discoverRepos', () => {
    it('should find directories containing .git', () => {
      const { fs } = createMemFs({
        '/source/repo1/.git/HEAD': 'ref: refs/heads/main',
        '/source/repo2/README.md': 'no git here',
        '/source/file.txt': 'not a repo',
      });
      const service = new RepoService(fs);

      const repos = service.discoverRepos('/source');

      expect(repos).toEqual(['/source/repo1']);
    });

    it('should return sorted repo paths', () => {
      const { fs } = createMemFs({
        '/source/zebra/.git/HEAD': '',
        '/source/alpha/.git/HEAD': '',
        '/source/beta/.git/HEAD': '',
      });
      const service = new RepoService(fs);

      const repos = service.discoverRepos('/source');

      expect(repos).toEqual(['/source/alpha', '/source/beta', '/source/zebra']);
    });

    it('should exclude non-directory entries', () => {
      const { fs } = createMemFs({
        '/source/repo1/.git/HEAD': '',
        '/source/README.md': 'readme',
        '/source/file.txt': 'file',
      });
      const service = new RepoService(fs);

      const repos = service.discoverRepos('/source');

      expect(repos).toEqual(['/source/repo1']);
    });

    it('should return empty array when no git repos found', () => {
      const { fs } = createMemFs({
        '/source/not-a-repo/README.md': 'readme',
      });
      const service = new RepoService(fs);

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
      serviceWithGit = new RepoService({} as any, gitStub as any);
    });

    afterEach(() => {
      sinon.restore();
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
      const unconfiguredService = new RepoService({} as any);

      await expect(
        unconfiguredService.findReposWithBranch(['/source/repo1'], 'feature')
      ).rejects.toThrow('RepoService not configured with git service');
    });
  });

  describe('formatRepoChoices', () => {
    const service = new RepoService({} as any);

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
