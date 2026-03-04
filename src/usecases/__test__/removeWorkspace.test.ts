import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RemoveWorkspaceUseCase } from '../removeWorkspace.js';
import { WorkspaceHasIssuesError } from '../../lib/errors.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorktreeService } from '../../lib/worktree.js';
import type { RepoService } from '../../lib/repos.js';
import type { StatusService } from '../../lib/status.js';
import type { TmuxService } from '../../lib/tmux.js';
import type { WorktreeStatus } from '../../lib/status.js';

describe('RemoveWorkspaceUseCase', () => {
  let useCase: RemoveWorkspaceUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let worktreeStub: sinon.SinonStubbedInstance<WorktreeService>;
  let reposStub: sinon.SinonStubbedInstance<RepoService>;
  let statusStub: sinon.SinonStubbedInstance<StatusService>;
  let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;

  const sourcePath = '/source';
  const workspacePath = '/dest/my-feature';

  beforeEach(() => {
    workspaceDirStub = {
      getWorktreeDirs: sinon.stub(),
      removeWorkspaceDir: sinon.stub(),
    } as any;

    worktreeStub = {
      removeWorktree: sinon.stub().resolves(),
    } as any;

    reposStub = {
      discoverRepos: sinon.stub().returns(['/source/repo1', '/source/repo2']),
    } as any;

    statusStub = {
      checkAllWorktrees: sinon.stub(),
    } as any;

    tmuxStub = {
      killSession: sinon.stub().resolves(),
    } as any;

    useCase = new RemoveWorkspaceUseCase(
      workspaceDirStub as any,
      worktreeStub as any,
      reposStub as any,
      statusStub as any,
      tmuxStub as any,
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should throw WorkspaceHasIssuesError when repos have uncommitted changes', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'dirty', untracked: 0, uncommitted: 2, unpushed: 0 } as WorktreeStatus },
    ]);

    await expect(
      useCase.execute({
        workspacePath,
        branchName: 'my-feature',
        sourcePath,
        tmux: false,
      })
    ).rejects.toThrow(WorkspaceHasIssuesError);

    // Should not have attempted removal
    expect(worktreeStub.removeWorktree.called).toBe(false);
  });

  it('should perform status check by default', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0 } as WorktreeStatus },
    ]);

    await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    // Should have called status check
    expect(statusStub.checkAllWorktrees.calledOnce).toBe(true);
    // Should have proceeded with removal since clean
    expect(worktreeStub.removeWorktree.calledOnce).toBe(true);
  });

  it('should remove workspace directory even with no worktrees', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    expect(statusStub.checkAllWorktrees.called).toBe(false);
    expect(workspaceDirStub.removeWorkspaceDir.calledOnce).toBe(true);
    expect(result.worktreesRemoved).toBe(0);
    expect(result.worktreesTotal).toBe(0);
    expect(result.workspaceDirRemoved).toBe(true);
  });

  it('should kill tmux session when tmux is enabled', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: true,
    });

    expect(tmuxStub.killSession.calledWith('my-feature')).toBe(true);
    expect(result.tmuxKilled).toBe(true);
  });

  it('should not fail if tmux session kill fails', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);
    tmuxStub.killSession.rejects(new Error('no session'));

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: true,
    });

    expect(result.tmuxKilled).toBe(false);
  });

  it('should track removal errors for repos not found in source', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/missing-repo`]);
    statusStub.checkAllWorktrees.resolves([
      { repoName: 'missing-repo', status: { type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0 } as WorktreeStatus },
    ]);
    reposStub.discoverRepos.returns(['/source/repo1']); // missing-repo not in source

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    expect(result.removalErrors).toHaveLength(1);
    expect(result.removalErrors[0].repo).toBe('missing-repo');
    expect(result.removalErrors[0].error).toBe('source repo not found');
  });
});
