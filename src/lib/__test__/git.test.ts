import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { GitService } from '../git.js';
import { createMockShell } from '../../test/test-utils.js';

describe('GitService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let service: GitService;

  beforeEach(() => {
    shell = createMockShell();
    service = new GitService(shell as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('fetch', () => {
    it('should execute git fetch with correct arguments', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.fetch('/repo');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'fetch', '--all', '--prune'],
        { encoding: 'utf-8' }
      );
    });

    it('should propagate errors from git fetch', async () => {
      shell.execFile.rejects(new Error('Network error'));

      await expect(service.fetch('/repo')).rejects.toThrow('Network error');
    });
  });

  describe('remoteBranchExists', () => {
    it('should execute ls-remote and return true when branch exists', async () => {
      shell.execFile.resolves({ stdout: 'abc123\trefs/heads/feature\n', stderr: '' });

      const result = await service.remoteBranchExists('/repo', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'ls-remote', '--heads', 'origin', 'feature'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe(true);
    });

    it('should return false when ls-remote returns empty output', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.remoteBranchExists('/repo', 'feature');

      expect(result).toBe(false);
    });
  });

  describe('localRemoteBranchExists', () => {
    it('should execute rev-parse and return true when branch exists', async () => {
      shell.execFile.resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'rev-parse', '--verify', 'origin/feature'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe(true);
    });

    it('should return false when rev-parse fails', async () => {
      shell.execFile.rejects(new Error('fatal: needed a single revision'));

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      expect(result).toBe(false);
    });
  });

  describe('findFirstExistingBranch', () => {
    it('should return first existing branch from candidates', async () => {
      shell.execFile.onFirstCall().rejects(new Error('not found'));
      shell.execFile.onSecondCall().resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.findFirstExistingBranch('/repo', ['master', 'main', 'trunk']);

      expect(result).toBe('main');
    });

    it('should return null when no candidates exist', async () => {
      shell.execFile.rejects(new Error('not found'));

      const result = await service.findFirstExistingBranch('/repo', ['master', 'main', 'trunk']);

      expect(result).toBe(null);
    });

    it('should return first candidate if it exists', async () => {
      shell.execFile.resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.findFirstExistingBranch('/repo', ['master', 'main']);

      expect(result).toBe('master');
    });

    it('should handle empty candidates array', async () => {
      const result = await service.findFirstExistingBranch('/repo', []);

      expect(result).toBe(null);
    });
  });

  describe('addWorktreeNewBranch', () => {
    it('should execute worktree add with -b flag', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.addWorktreeNewBranch('/repo', '/worktree', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'add', '-b', 'feature', '/worktree'],
        { encoding: 'utf-8' }
      );
    });

    it('should include source branch when provided', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.addWorktreeNewBranch('/repo', '/worktree', 'feature', 'main');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'add', '-b', 'feature', '/worktree', 'main'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('addWorktree', () => {
    it('should execute worktree add for existing branch', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.addWorktree('/repo', '/worktree', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'add', '/worktree', 'feature'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('pull', () => {
    it('should execute git pull in worktree directory', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.pull('/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'pull'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('push', () => {
    it('should execute git push', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.push('/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'push'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('pushSetUpstream', () => {
    it('should execute git push with set-upstream flag', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.pushSetUpstream('/worktree', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'push', '--set-upstream', 'origin', 'feature'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('getCurrentBranch', () => {
    it('should execute rev-parse to get current branch', async () => {
      shell.execFile.resolves({ stdout: 'feature\n', stderr: '' });

      const branch = await service.getCurrentBranch('/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf-8' }
      );
      expect(branch).toBe('feature');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should execute git status --porcelain', async () => {
      shell.execFile.resolves({ stdout: 'M file.txt\n', stderr: '' });

      const result = await service.hasUncommittedChanges('/repo');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'status', '--porcelain'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe(true);
    });

    it('should return false when status is clean', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.hasUncommittedChanges('/repo');

      expect(result).toBe(false);
    });
  });

  describe('originBranchExists', () => {
    it('should check both current branch and origin ref', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.originBranchExists('/repo');

      expect(shell.execFile.callCount).toBe(2);
      sinon.assert.calledWith(
        shell.execFile.firstCall,
        'git',
        ['-C', '/repo', 'rev-parse', '--abbrev-ref', 'HEAD']
      );
      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'git',
        ['-C', '/repo', 'rev-parse', '--verify', 'origin/feature']
      );
      expect(result).toBe(true);
    });

    it('should return false when origin branch does not exist', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().rejects(new Error('fatal'));

      const result = await service.originBranchExists('/repo');

      expect(result).toBe(false);
    });
  });

  describe('isAheadOfOrigin', () => {
    it('should execute rev-list to count commits ahead', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: '3', stderr: '' });

      const result = await service.isAheadOfOrigin('/repo');

      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'git',
        ['-C', '/repo', 'rev-list', '--count', 'origin/feature..HEAD']
      );
      expect(result).toBe(true);
    });

    it('should return false when count is zero', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: '0', stderr: '' });

      const result = await service.isAheadOfOrigin('/repo');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      shell.execFile.rejects(new Error('fatal'));

      const result = await service.isAheadOfOrigin('/repo');

      expect(result).toBe(false);
    });
  });

  describe('isBehindOrigin', () => {
    it('should execute rev-list to count commits behind', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: '2', stderr: '' });

      const result = await service.isBehindOrigin('/repo');

      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'git',
        ['-C', '/repo', 'rev-list', '--count', 'HEAD..origin/feature']
      );
      expect(result).toBe(true);
    });

    it('should return false when count is zero', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: '0', stderr: '' });

      const result = await service.isBehindOrigin('/repo');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      shell.execFile.rejects(new Error('fatal'));

      const result = await service.isBehindOrigin('/repo');

      expect(result).toBe(false);
    });
  });

  describe('isAheadOfMain', () => {
    it('should execute git cherry against main branch', async () => {
      shell.execFile.resolves({ stdout: '+ abc1234 commit message\n', stderr: '' });

      const result = await service.isAheadOfMain('/repo', 'master');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'cherry', 'origin/master', 'HEAD'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe(true);
    });

    it('should return false when no unmerged commits (empty output)', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.isAheadOfMain('/repo', 'main');

      expect(result).toBe(false);
    });

    it('should return false when all commits are merged (only - lines)', async () => {
      shell.execFile.resolves({
        stdout: '- abc1234 commit message\n- def5678 another commit\n',
        stderr: ''
      });

      const result = await service.isAheadOfMain('/repo', 'master');

      expect(result).toBe(false);
    });

    it('should return true when mixed output has unmerged commits', async () => {
      shell.execFile.resolves({
        stdout: '- abc1234 merged commit\n+ def5678 unmerged commit\n',
        stderr: ''
      });

      const result = await service.isAheadOfMain('/repo', 'main');

      expect(result).toBe(true);
    });

    it('should return true on error (safe default)', async () => {
      shell.execFile.rejects(new Error('fatal'));

      const result = await service.isAheadOfMain('/repo', 'master');

      expect(result).toBe(true);
    });
  });

  describe('removeWorktree', () => {
    it('should execute worktree remove', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.removeWorktree('/repo', '/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'remove', '/worktree'],
        { encoding: 'utf-8' }
      );
    });
  });

  describe('getLastCommitDate', () => {
    it('should execute git log to get last commit date', async () => {
      shell.execFile.resolves({ stdout: '2026-01-15T10:30:45+00:00\n', stderr: '' });

      const result = await service.getLastCommitDate('/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'log', '-1', '--format=%aI', 'HEAD'],
        { encoding: 'utf-8' }
      );
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2026-01-15T10:30:45.000Z');
    });

    it('should parse ISO date correctly', async () => {
      shell.execFile.resolves({ stdout: '2025-12-25T15:45:30-05:00', stderr: '' });

      const result = await service.getLastCommitDate('/repo');

      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11); // December is month 11
    });

    it('should handle whitespace in git output', async () => {
      shell.execFile.resolves({ stdout: '  2026-02-01T12:00:00Z\n  ', stderr: '' });

      const result = await service.getLastCommitDate('/worktree');

      expect(result).toBeInstanceOf(Date);
    });

    it('should propagate errors from git log', async () => {
      shell.execFile.rejects(new Error('fatal: bad revision'));

      await expect(service.getLastCommitDate('/repo')).rejects.toThrow('fatal: bad revision');
    });
  });

  describe('pushWithRetry', () => {
    it('should return "pushed" on successful push', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.pushWithRetry('/worktree');

      sinon.assert.calledOnce(shell.execFile);
      sinon.assert.calledWith(
        shell.execFile.firstCall,
        'git',
        ['-C', '/worktree', 'push']
      );
      expect(result).toBe('pushed');
    });

    it('should retry with set-upstream when no upstream configured', async () => {
      const noUpstreamError: any = new Error('push failed');
      noUpstreamError.stderr = 'fatal: The current branch has no upstream branch';

      shell.execFile.onFirstCall().rejects(noUpstreamError);
      shell.execFile.onSecondCall().resolves({ stdout: 'feature\n', stderr: '' }); // getCurrentBranch
      shell.execFile.onThirdCall().resolves({ stdout: '', stderr: '' }); // pushSetUpstream

      const result = await service.pushWithRetry('/worktree');

      expect(shell.execFile.callCount).toBe(3);
      sinon.assert.calledWith(shell.execFile.firstCall, 'git', ['-C', '/worktree', 'push']);
      sinon.assert.calledWith(shell.execFile.secondCall, 'git', [
        '-C',
        '/worktree',
        'rev-parse',
        '--abbrev-ref',
        'HEAD',
      ]);
      sinon.assert.calledWith(shell.execFile.thirdCall, 'git', [
        '-C',
        '/worktree',
        'push',
        '--set-upstream',
        'origin',
        'feature',
      ]);
      expect(result).toBe('pushed (set upstream)');
    });

    it('should handle "no upstream" error message variant', async () => {
      const noUpstreamError: any = new Error('push failed');
      noUpstreamError.stderr = 'fatal: no upstream configured for branch';

      shell.execFile.onFirstCall().rejects(noUpstreamError);
      shell.execFile.onSecondCall().resolves({ stdout: 'feature', stderr: '' });
      shell.execFile.onThirdCall().resolves({ stdout: '', stderr: '' });

      const result = await service.pushWithRetry('/worktree');

      expect(result).toBe('pushed (set upstream)');
    });

    it('should check error message when no stderr available', async () => {
      const error = new Error('fatal: no upstream branch');

      shell.execFile.onFirstCall().rejects(error);
      shell.execFile.onSecondCall().resolves({ stdout: 'main', stderr: '' });
      shell.execFile.onThirdCall().resolves({ stdout: '', stderr: '' });

      const result = await service.pushWithRetry('/worktree');

      expect(result).toBe('pushed (set upstream)');
    });

    it('should throw error for non-upstream-related failures', async () => {
      const error: any = new Error('network error');
      error.stderr = 'fatal: unable to access remote';

      shell.execFile.rejects(error);

      await expect(service.pushWithRetry('/worktree')).rejects.toThrow('network error');
      sinon.assert.calledOnce(shell.execFile);
    });

    it('should trim branch name before setting upstream', async () => {
      const noUpstreamError: any = new Error('push failed');
      noUpstreamError.stderr = 'fatal: no upstream';

      shell.execFile.onFirstCall().rejects(noUpstreamError);
      shell.execFile.onSecondCall().resolves({ stdout: 'feature\n  ', stderr: '' });
      shell.execFile.onThirdCall().resolves({ stdout: '', stderr: '' });

      await service.pushWithRetry('/worktree');

      sinon.assert.calledWith(shell.execFile.thirdCall, 'git', [
        '-C',
        '/worktree',
        'push',
        '--set-upstream',
        'origin',
        'feature',
      ]);
    });
  });
});
