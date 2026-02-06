import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { StatusService } from './status.js';
import { GitService } from './git.js';
import { createMockShell } from './test-utils.js';

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
      sinon.assert.notCalled(gitStub.originBranchExists);
    });

    it('should check origin branch existence when no uncommitted changes', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(true);
      gitStub.isAheadOfOrigin.resolves(false);
      gitStub.isBehindOrigin.resolves(false);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      sinon.assert.calledOnce(gitStub.hasUncommittedChanges);
      sinon.assert.calledOnceWithExactly(gitStub.originBranchExists, '/worktree');
      sinon.assert.calledOnce(gitStub.isAheadOfOrigin);
      sinon.assert.calledOnce(gitStub.isBehindOrigin);
      expect(status).toEqual({ type: 'clean', comparedTo: 'origin' });
    });

    it('should detect ahead of origin', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(true);
      gitStub.isAheadOfOrigin.resolves(true);
      gitStub.isBehindOrigin.resolves(false);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status).toEqual({ type: 'ahead', comparedTo: 'origin' });
    });

    it('should detect behind origin', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(true);
      gitStub.isAheadOfOrigin.resolves(false);
      gitStub.isBehindOrigin.resolves(true);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status).toEqual({ type: 'behind', comparedTo: 'origin' });
    });

    it('should detect diverged from origin', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(true);
      gitStub.isAheadOfOrigin.resolves(true);
      gitStub.isBehindOrigin.resolves(true);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      expect(status).toEqual({ type: 'diverged', comparedTo: 'origin' });
    });

    it('should compare against main when no origin branch', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(false);
      gitStub.isAheadOfMain.resolves(true);

      const status = await service.getWorktreeStatus('/worktree', 'master');

      sinon.assert.calledOnceWithExactly(gitStub.isAheadOfMain, '/worktree', 'master');
      expect(status).toEqual({ type: 'ahead', comparedTo: 'main' });
    });

    it('should return clean when synced with main', async () => {
      gitStub.hasUncommittedChanges.resolves(false);
      gitStub.originBranchExists.resolves(false);
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
      expect(StatusService.getStatusMessage({ type: 'ahead', comparedTo: 'origin' }, 'master')).toBe('ahead of origin');
      expect(StatusService.getStatusMessage({ type: 'ahead', comparedTo: 'main' }, 'master')).toBe('ahead of master');
      expect(StatusService.getStatusMessage({ type: 'behind', comparedTo: 'origin' }, 'master')).toBe('behind origin');
      expect(StatusService.getStatusMessage({ type: 'diverged', comparedTo: 'origin' }, 'master')).toBe('diverged from origin');
      expect(StatusService.getStatusMessage({ type: 'error', error: 'fatal' }, 'master')).toBe('error: fatal');
    });
  });

  describe('hasIssues', () => {
    it('should return true for problem statuses', () => {
      expect(StatusService.hasIssues({ type: 'uncommitted' })).toBe(true);
      expect(StatusService.hasIssues({ type: 'ahead', comparedTo: 'origin' })).toBe(true);
      expect(StatusService.hasIssues({ type: 'diverged', comparedTo: 'origin' })).toBe(true);
      expect(StatusService.hasIssues({ type: 'error', error: 'fatal' })).toBe(true);
    });

    it('should return false for clean statuses', () => {
      expect(StatusService.hasIssues({ type: 'clean', comparedTo: 'origin' })).toBe(false);
      expect(StatusService.hasIssues({ type: 'behind', comparedTo: 'origin' })).toBe(false);
    });
  });
});
