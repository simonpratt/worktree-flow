import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RepoService } from './repos.js';
import { createMockFileSystem } from './test-utils.js';

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
});
