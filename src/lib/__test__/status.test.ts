import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { StatusService } from '../status.js';
import { GitService } from '../git.js';
import { createMockShell } from '../../test/test-utils.js';

describe('StatusService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let git: GitService;
  let gitStub: sinon.SinonStubbedInstance<GitService>;
  let service: StatusService;

  beforeEach(() => {
    shell = createMockShell();
    git = new GitService(shell as any);
    gitStub = sinon.stub(git);
    service = new StatusService(gitStub as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getWorktreeStatus', () => {
    it('should check for uncommitted changes first', async () => {
      gitStub.hasUncommittedChanges.resolves(true);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      sinon.assert.calledOnceWithExactly(gitStub.hasUncommittedChanges, '/worktree');
      expect(status).toEqual({ type: 'uncommitted' });
      // Should not check other statuses
      sinon.assert.notCalled(gitStub.isAheadOfMain);
    });

    it('should compare against main using git cherry when no uncommitted changes', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.resolves(false);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      sinon.assert.calledOnce(gitStub.hasUncommittedChanges);
      sinon.assert.calledOnceWithExactly(gitStub.isAheadOfMain, '/worktree', 'master');
      expect(status).toEqual({ type: 'clean', comparedTo: 'main' });
    });

    it('should detect ahead of main', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.resolves(true);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status).toEqual({ type: 'ahead', comparedTo: 'main' });
    });

    it('should return clean when synced with main', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.resolves(false);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status).toEqual({ type: 'clean', comparedTo: 'main' });
    });

    it('should catch errors and return error status', async () => {
      const error: any = new Error('git error');
      error.stderr = 'fatal: not a git repository';
      gitStub.hasUncommittedChanges.rejects(error);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status.type).toBe('error');
      expect(status.error).toBe('fatal: not a git repository');
    });

    it('should use error message when stderr not available', async () => {
      gitStub.hasUncommittedChanges.rejects(new Error('generic error'));

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status.type).toBe('error');
      expect(status.error).toBe('generic error');
    });
  });

  describe('getStatusMessage', () => {
    it('should return correct message for each status type', () => {
      expect(StatusService.getStatusMessage({ type: 'clean' }, 'master')).toBe('up to date');
      expect(StatusService.getStatusMessage({ type: 'uncommitted' }, 'master')).toBe('uncommitted changes');
      expect(StatusService.getStatusMessage({ type: 'ahead', comparedTo: 'main' }, 'master')).toBe('ahead of master');
      expect(StatusService.getStatusMessage({ type: 'error', error: 'fatal' }, 'master')).toBe('error: fatal');
    });
  });

  describe('hasIssues', () => {
    it('should return true for uncommitted changes and errors', () => {
      expect(StatusService.hasIssues({ type: 'uncommitted' })).toBe(true);
      expect(StatusService.hasIssues({ type: 'error', error: 'fatal' })).toBe(true);
    });

    it('should return false for clean and ahead statuses', () => {
      expect(StatusService.hasIssues({ type: 'clean', comparedTo: 'main' })).toBe(false);
      expect(StatusService.hasIssues({ type: 'ahead', comparedTo: 'main' })).toBe(false);
    });
  });

  describe('checkAllWorktrees', () => {
    it('should check status for all worktrees in parallel', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.onFirstCall().resolves(false);
      gitStub.isAheadOfMain.onSecondCall().resolves(true);

      const results = await service.checkAllWorktrees(
        ['/workspace/repo1', '/workspace/repo2'],
        () => 'master'
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        repoName: 'repo1',
        status: { type: 'clean', comparedTo: 'main' },
      });
      expect(results[1]).toEqual({
        repoName: 'repo2',
        status: { type: 'ahead', comparedTo: 'main' },
      });
    });

    it('should extract repo names from paths', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.resolves(false);

      const results = await service.checkAllWorktrees(
        ['/long/path/to/workspace/my-repo'],
        () => 'main'
      );

      expect(results[0].repoName).toBe('my-repo');
    });

    it('should handle errors in individual worktrees', async () => {
      gitStub.hasUncommittedChanges.onFirstCall().resolves(false);
      gitStub.hasUncommittedChanges.onSecondCall().rejects(new Error('git error'));
      gitStub.isAheadOfMain.onFirstCall().resolves(false);

      const results = await service.checkAllWorktrees(
        ['/workspace/repo1', '/workspace/repo2'],
        () => 'master'
      );

      expect(results).toHaveLength(2);
      expect(results[0].status.type).toBe('clean');
      expect(results[1].status.type).toBe('error');
      expect(results[1].status.error).toBe('git error');
    });

    it('should return empty array for empty worktree list', async () => {
      const results = await service.checkAllWorktrees([], () => 'master');

      expect(results).toEqual([]);
      sinon.assert.notCalled(gitStub.hasUncommittedChanges);
    });

    it('should call getBaseBranch with correct repo name', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.onFirstCall().resolves(false);
      gitStub.isAheadOfMain.onSecondCall().resolves(false);

      const getBaseBranch = sinon.stub();
      getBaseBranch.withArgs('repo1').returns('master');
      getBaseBranch.withArgs('repo2').returns('main');

      await service.checkAllWorktrees(
        ['/workspace/repo1', '/workspace/repo2'],
        getBaseBranch
      );

      sinon.assert.calledWith(getBaseBranch, 'repo1');
      sinon.assert.calledWith(getBaseBranch, 'repo2');
      sinon.assert.calledWith(gitStub.isAheadOfMain, '/workspace/repo1', 'master');
      sinon.assert.calledWith(gitStub.isAheadOfMain, '/workspace/repo2', 'main');
    });
  });

  describe('findReposWithIssues', () => {
    it('should return repos that have issues', async () => {
      gitStub.hasUncommittedChanges.onFirstCall().resolves(true);
      gitStub.hasUncommittedChanges.onSecondCall().resolves(false);
      gitStub.hasUncommittedChanges.onThirdCall().resolves(false);
      gitStub.isAheadOfMain.onFirstCall().resolves(true);
      gitStub.isAheadOfMain.onSecondCall().resolves(false);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2', '/workspace/repo3'],
        () => 'master'
      );

      // Only repo1 has uncommitted changes (repo2 is just ahead, which is safe)
      expect(reposWithIssues).toEqual(['repo1']);
    });

    it('should return empty array when all repos are clean', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.isAheadOfMain.resolves(false);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2'],
        () => 'master'
      );

      expect(reposWithIssues).toEqual([]);
    });

    it('should include repos with errors as having issues', async () => {
      gitStub.hasUncommittedChanges.onFirstCall().resolves(false);
      gitStub.hasUncommittedChanges.onSecondCall().rejects(new Error('fatal'));
      gitStub.isAheadOfMain.onFirstCall().resolves(false);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2'],
        () => 'master'
      );

      expect(reposWithIssues).toEqual(['repo2']);
    });
  });
});
