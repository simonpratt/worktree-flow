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
    it('should return true when local branch exists', async () => {
      shell.execFile.resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'rev-parse', '--verify', 'feature'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe(true);
    });

    it('should check remote branch when local branch does not exist', async () => {
      shell.execFile.onFirstCall().rejects(new Error('fatal: needed a single revision'));
      shell.execFile.onSecondCall().resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      expect(shell.execFile.callCount).toBe(2);
      sinon.assert.calledWith(
        shell.execFile.firstCall,
        'git',
        ['-C', '/repo', 'rev-parse', '--verify', 'feature']
      );
      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'git',
        ['-C', '/repo', 'rev-parse', '--verify', 'origin/feature']
      );
      expect(result).toBe(true);
    });

    it('should return false when both local and remote branch do not exist', async () => {
      shell.execFile.rejects(new Error('fatal: needed a single revision'));

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      expect(result).toBe(false);
    });

    it('should return true for local branch even if remote exists', async () => {
      shell.execFile.resolves({ stdout: 'abc123', stderr: '' });

      const result = await service.localRemoteBranchExists('/repo', 'feature');

      // Should only check local branch and return immediately
      sinon.assert.calledOnce(shell.execFile);
      expect(result).toBe(true);
    });
  });

  describe('findFirstExistingBranch', () => {
    it('should return first existing branch from candidates', async () => {
      // master: local fails, origin/master fails
      shell.execFile.onCall(0).rejects(new Error('not found'));
      shell.execFile.onCall(1).rejects(new Error('not found'));
      // main: local succeeds
      shell.execFile.onCall(2).resolves({ stdout: 'abc123', stderr: '' });

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
    it('should execute worktree add with --no-track and -b flags', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.addWorktreeNewBranch('/repo', '/worktree', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'add', '--no-track', '-b', 'feature', '/worktree'],
        { encoding: 'utf-8' }
      );
    });

    it('should include source branch when provided', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      await service.addWorktreeNewBranch('/repo', '/worktree', 'feature', 'main');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'worktree', 'add', '--no-track', '-b', 'feature', '/worktree', 'main'],
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

  describe('getUpstreamBranch', () => {
    it('should execute rev-parse to get upstream branch', async () => {
      shell.execFile.resolves({ stdout: 'origin/feature\n', stderr: '' });

      const upstream = await service.getUpstreamBranch('/worktree');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/worktree', 'rev-parse', '--abbrev-ref', '@{u}'],
        { encoding: 'utf-8' }
      );
      expect(upstream).toBe('origin/feature');
    });

    it('should return null when no upstream is configured', async () => {
      shell.execFile.rejects(new Error('fatal: no upstream configured'));

      const upstream = await service.getUpstreamBranch('/worktree');

      expect(upstream).toBe(null);
    });
  });

  describe('getStatusCounts', () => {
    it('should parse untracked and uncommitted files from porcelain output', async () => {
      shell.execFile.resolves({
        stdout: '?? new-file.txt\n M modified.txt\nA  staged.txt\n',
        stderr: '',
      });

      const result = await service.getStatusCounts('/repo');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'status', '--porcelain'],
        { encoding: 'utf-8' }
      );
      expect(result).toEqual({ untracked: 1, uncommitted: 2 });
    });

    it('should return zeros when status is clean', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.getStatusCounts('/repo');

      expect(result).toEqual({ untracked: 0, uncommitted: 0 });
    });

    it('should count multiple untracked files', async () => {
      shell.execFile.resolves({
        stdout: '?? a.txt\n?? b.txt\n?? c.txt\n',
        stderr: '',
      });

      const result = await service.getStatusCounts('/repo');

      expect(result).toEqual({ untracked: 3, uncommitted: 0 });
    });

    it('should count various tracked file statuses as uncommitted', async () => {
      shell.execFile.resolves({
        stdout: ' M modified.txt\nA  added.txt\n D deleted.txt\nMM both.txt\n',
        stderr: '',
      });

      const result = await service.getStatusCounts('/repo');

      expect(result).toEqual({ untracked: 0, uncommitted: 4 });
    });

    it('should handle mixed untracked and uncommitted files', async () => {
      shell.execFile.resolves({
        stdout: '?? new.txt\n M mod.txt\n?? another.txt\nA  staged.txt\n',
        stderr: '',
      });

      const result = await service.getStatusCounts('/repo');

      expect(result).toEqual({ untracked: 2, uncommitted: 2 });
    });
  });

  describe('getUnpushedCommitCount', () => {
    it('should return count of unpushed commits', async () => {
      // getCurrentBranch
      shell.execFile.onFirstCall().resolves({ stdout: 'feature\n', stderr: '' });
      // rev-list --count
      shell.execFile.onSecondCall().resolves({ stdout: '3\n', stderr: '' });

      const result = await service.getUnpushedCommitCount('/repo');

      sinon.assert.calledWith(
        shell.execFile.secondCall,
        'git',
        ['-C', '/repo', 'rev-list', '--count', 'origin/feature..HEAD']
      );
      expect(result).toBe(3);
    });

    it('should return 0 when no unpushed commits', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature\n', stderr: '' });
      shell.execFile.onSecondCall().resolves({ stdout: '0\n', stderr: '' });

      const result = await service.getUnpushedCommitCount('/repo');

      expect(result).toBe(0);
    });

    it('should fall back to --not --remotes when origin/<branch> does not exist', async () => {
      // getCurrentBranch
      shell.execFile.onFirstCall().resolves({ stdout: 'feature\n', stderr: '' });
      // rev-list origin/feature..HEAD fails (no remote-tracking ref)
      shell.execFile.onSecondCall().rejects(new Error("fatal: ambiguous argument 'origin/feature..HEAD'"));
      // fallback: rev-list --count HEAD --not --remotes
      shell.execFile.onThirdCall().resolves({ stdout: '2\n', stderr: '' });

      const result = await service.getUnpushedCommitCount('/repo');

      sinon.assert.calledWith(
        shell.execFile.thirdCall,
        'git',
        ['-C', '/repo', 'rev-list', '--count', 'HEAD', '--not', '--remotes']
      );
      expect(result).toBe(2);
    });

    it('should return 0 on unexpected error', async () => {
      shell.execFile.onFirstCall().resolves({ stdout: 'feature\n', stderr: '' });
      // Both the primary and fallback calls fail
      shell.execFile.onSecondCall().rejects(new Error('fatal: not a git repo'));
      shell.execFile.onThirdCall().rejects(new Error('fatal: not a git repo'));

      const result = await service.getUnpushedCommitCount('/repo');

      expect(result).toBe(0);
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

  describe('getBranchCheckedOutPath', () => {
    it('should return worktree path when branch is checked out somewhere', async () => {
      shell.execFile.resolves({ stdout: '/some/worktree/path\n', stderr: '' });

      const result = await service.getBranchCheckedOutPath('/repo', 'feature');

      sinon.assert.calledOnceWithExactly(
        shell.execFile,
        'git',
        ['-C', '/repo', 'for-each-ref', '--format=%(worktreepath)', 'refs/heads/feature'],
        { encoding: 'utf-8' }
      );
      expect(result).toBe('/some/worktree/path');
    });

    it('should return null when branch exists but is not checked out', async () => {
      shell.execFile.resolves({ stdout: '\n', stderr: '' });

      const result = await service.getBranchCheckedOutPath('/repo', 'feature');

      expect(result).toBe(null);
    });

    it('should return null when branch does not exist (empty output)', async () => {
      shell.execFile.resolves({ stdout: '', stderr: '' });

      const result = await service.getBranchCheckedOutPath('/repo', 'feature');

      expect(result).toBe(null);
    });

    it('should handle whitespace in output', async () => {
      shell.execFile.resolves({ stdout: '  /some/path  \n', stderr: '' });

      const result = await service.getBranchCheckedOutPath('/repo', 'feature');

      expect(result).toBe('/some/path');
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
