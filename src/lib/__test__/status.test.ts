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
    it('should return dirty when untracked files exist', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves('origin/feature');
      gitStub.getStatusCounts.resolves({ untracked: 3, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'dirty',
        untracked: 3,
        uncommitted: 0,
        unpushed: 0,
        currentBranch: 'feature',
        upstreamBranch: 'origin/feature',
      });
    });

    it('should return dirty when uncommitted changes exist', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves('origin/feature');
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 2 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'dirty',
        untracked: 0,
        uncommitted: 2,
        unpushed: 0,
        currentBranch: 'feature',
        upstreamBranch: 'origin/feature',
      });
    });

    it('should return clean when no changes exist', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves('origin/feature');
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'clean',
        untracked: 0,
        uncommitted: 0,
        unpushed: 0,
        currentBranch: 'feature',
        upstreamBranch: 'origin/feature',
      });
    });

    it('should return clean when only unpushed commits exist', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves('origin/feature');
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(3);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'clean',
        untracked: 0,
        uncommitted: 0,
        unpushed: 3,
        currentBranch: 'feature',
        upstreamBranch: 'origin/feature',
      });
    });

    it('should handle branches with no upstream', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'clean',
        untracked: 0,
        uncommitted: 0,
        unpushed: 0,
        currentBranch: 'feature',
        upstreamBranch: null,
      });
    });

    it('should catch errors and return error status', async () => {
      const error: any = new Error('git error');
      error.stderr = 'fatal: not a git repository';
      gitStub.getCurrentBranch.rejects(error);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status.type).toBe('error');
      expect(status.error).toBe('fatal: not a git repository');
      expect(status.untracked).toBe(0);
      expect(status.uncommitted).toBe(0);
      expect(status.unpushed).toBe(0);
    });

    it('should use error message when stderr not available', async () => {
      gitStub.getCurrentBranch.rejects(new Error('generic error'));

      const status = await service.getWorktreeStatus('/worktree');

      expect(status.type).toBe('error');
      expect(status.error).toBe('generic error');
    });

    it('should collect all counts without short-circuiting', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves('origin/feature');
      gitStub.getStatusCounts.resolves({ untracked: 1, uncommitted: 2 });
      gitStub.getUnpushedCommitCount.resolves(3);

      const status = await service.getWorktreeStatus('/worktree');

      expect(status).toEqual({
        type: 'dirty',
        untracked: 1,
        uncommitted: 2,
        unpushed: 3,
        currentBranch: 'feature',
        upstreamBranch: 'origin/feature',
      });
      // All git methods should have been called (no short-circuiting)
      sinon.assert.calledOnce(gitStub.getStatusCounts);
      sinon.assert.calledOnce(gitStub.getUnpushedCommitCount);
    });
  });

  describe('getStatusMessage', () => {
    it('should return "clean" for fully clean status', () => {
      expect(StatusService.getStatusMessage({
        type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0,
      })).toBe('clean');
    });

    it('should return count-based message for untracked files', () => {
      expect(StatusService.getStatusMessage({
        type: 'dirty', untracked: 3, uncommitted: 0, unpushed: 0,
      })).toBe('3 untracked');
    });

    it('should return count-based message for modified files', () => {
      expect(StatusService.getStatusMessage({
        type: 'dirty', untracked: 0, uncommitted: 2, unpushed: 0,
      })).toBe('2 modified');
    });

    it('should return count-based message for unpushed commits', () => {
      expect(StatusService.getStatusMessage({
        type: 'clean', untracked: 0, uncommitted: 0, unpushed: 1,
      })).toBe('1 unpushed commit');
    });

    it('should pluralize unpushed commits', () => {
      expect(StatusService.getStatusMessage({
        type: 'clean', untracked: 0, uncommitted: 0, unpushed: 3,
      })).toBe('3 unpushed commits');
    });

    it('should combine multiple counts with commas', () => {
      expect(StatusService.getStatusMessage({
        type: 'dirty', untracked: 3, uncommitted: 2, unpushed: 1,
      })).toBe('3 untracked, 2 modified, 1 unpushed commit');
    });

    it('should return error message', () => {
      expect(StatusService.getStatusMessage({
        type: 'error', untracked: 0, uncommitted: 0, unpushed: 0, error: 'fatal',
      })).toBe('error: fatal');
    });
  });

  describe('hasIssues', () => {
    it('should return true for untracked files', () => {
      expect(StatusService.hasIssues({
        type: 'dirty', untracked: 1, uncommitted: 0, unpushed: 0,
      })).toBe(true);
    });

    it('should return true for uncommitted changes', () => {
      expect(StatusService.hasIssues({
        type: 'dirty', untracked: 0, uncommitted: 1, unpushed: 0,
      })).toBe(true);
    });

    it('should return true for errors', () => {
      expect(StatusService.hasIssues({
        type: 'error', untracked: 0, uncommitted: 0, unpushed: 0, error: 'fatal',
      })).toBe(true);
    });

    it('should return false for clean status', () => {
      expect(StatusService.hasIssues({
        type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0,
      })).toBe(false);
    });

    it('should return false when only unpushed commits exist', () => {
      expect(StatusService.hasIssues({
        type: 'clean', untracked: 0, uncommitted: 0, unpushed: 5,
      })).toBe(false);
    });
  });

  describe('checkAllWorktrees', () => {
    it('should check status for all worktrees in parallel', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.onFirstCall().resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getStatusCounts.onSecondCall().resolves({ untracked: 1, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const results = await service.checkAllWorktrees(
        ['/workspace/repo1', '/workspace/repo2']
      );

      expect(results).toHaveLength(2);
      expect(results[0].repoName).toBe('repo1');
      expect(results[0].status.type).toBe('clean');
      expect(results[1].repoName).toBe('repo2');
      expect(results[1].status.type).toBe('dirty');
    });

    it('should extract repo names from paths', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const results = await service.checkAllWorktrees(
        ['/long/path/to/workspace/my-repo']
      );

      expect(results[0].repoName).toBe('my-repo');
    });

    it('should handle errors in individual worktrees', async () => {
      gitStub.getCurrentBranch.onFirstCall().resolves('feature');
      gitStub.getCurrentBranch.onSecondCall().rejects(new Error('git error'));
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const results = await service.checkAllWorktrees(
        ['/workspace/repo1', '/workspace/repo2']
      );

      expect(results).toHaveLength(2);
      expect(results[0].status.type).toBe('clean');
      expect(results[1].status.type).toBe('error');
      expect(results[1].status.error).toBe('git error');
    });

    it('should return empty array for empty worktree list', async () => {
      const results = await service.checkAllWorktrees([]);

      expect(results).toEqual([]);
      sinon.assert.notCalled(gitStub.getStatusCounts);
    });
  });

  describe('findReposWithIssues', () => {
    it('should return repos that have issues', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves(null);
      // repo1: dirty (untracked)
      gitStub.getStatusCounts.onCall(0).resolves({ untracked: 1, uncommitted: 0 });
      // repo2: clean with unpushed (safe)
      gitStub.getStatusCounts.onCall(1).resolves({ untracked: 0, uncommitted: 0 });
      // repo3: clean
      gitStub.getStatusCounts.onCall(2).resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.onCall(0).resolves(0);
      gitStub.getUnpushedCommitCount.onCall(1).resolves(3);
      gitStub.getUnpushedCommitCount.onCall(2).resolves(0);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2', '/workspace/repo3']
      );

      // Only repo1 has issues (repo2 only has unpushed, which is safe)
      expect(reposWithIssues).toEqual(['repo1']);
    });

    it('should return empty array when all repos are clean', async () => {
      gitStub.getCurrentBranch.resolves('feature');
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2']
      );

      expect(reposWithIssues).toEqual([]);
    });

    it('should include repos with errors as having issues', async () => {
      gitStub.getCurrentBranch.onFirstCall().resolves('feature');
      gitStub.getCurrentBranch.onSecondCall().rejects(new Error('fatal'));
      gitStub.getUpstreamBranch.resolves(null);
      gitStub.getStatusCounts.resolves({ untracked: 0, uncommitted: 0 });
      gitStub.getUnpushedCommitCount.resolves(0);

      const reposWithIssues = await service.findReposWithIssues(
        ['/workspace/repo1', '/workspace/repo2']
      );

      expect(reposWithIssues).toEqual(['repo2']);
    });
  });
});
