import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RemoveWorkspaceUseCase } from '../removeWorkspace.js';
import { WorkspaceHasIssuesError } from '../../lib/errors.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorktreeService } from '../../lib/worktree.js';
import type { RepoService } from '../../lib/repos.js';
import type { StatusService } from '../../lib/status.js';
import type { TmuxService } from '../../lib/tmux.js';
import type { TrashService } from '../../lib/trash.js';
import type { WorktreeStatus } from '../../lib/status.js';

describe('RemoveWorkspaceUseCase', () => {
  let useCase: RemoveWorkspaceUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let worktreeStub: sinon.SinonStubbedInstance<WorktreeService>;
  let reposStub: sinon.SinonStubbedInstance<RepoService>;
  let statusStub: sinon.SinonStubbedInstance<StatusService>;
  let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;
  let trashStub: sinon.SinonStubbedInstance<TrashService>;

  const sourcePath = '/source';
  const workspacePath = '/dest/my-feature';
  const trashedPath = '/dest/.flow-trash/my-feature-1';

  const clean = (repoName: string) => ({
    repoName,
    status: { type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0 } as WorktreeStatus,
  });

  beforeEach(() => {
    workspaceDirStub = {
      getWorktreeDirs: sinon.stub(),
    } as any;

    worktreeStub = {
      pruneWorktrees: sinon.stub().resolves(),
    } as any;

    reposStub = {
      discoverRepos: sinon.stub().returns(['/source/repo1', '/source/repo2']),
    } as any;

    statusStub = {
      checkAllWorktrees: sinon.stub(),
    } as any;

    tmuxStub = {
      killSession: sinon.stub().resolves(true),
    } as any;

    trashStub = {
      moveToTrash: sinon.stub().returns(trashedPath),
      deleteInBackground: sinon.stub(),
    } as any;

    useCase = new RemoveWorkspaceUseCase(
      workspaceDirStub as any,
      worktreeStub as any,
      reposStub as any,
      statusStub as any,
      tmuxStub as any,
      trashStub as any,
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should throw WorkspaceHasIssuesError and leave the workspace untouched when repos have uncommitted changes', async () => {
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

    expect(trashStub.moveToTrash.called).toBe(false);
    expect(worktreeStub.pruneWorktrees.called).toBe(false);
    expect(trashStub.deleteInBackground.called).toBe(false);
  });

  it('should move the workspace to trash, then prune each source repo, then delete in the background', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`, `${workspacePath}/repo2`]);
    statusStub.checkAllWorktrees.resolves([clean('repo1'), clean('repo2')]);

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    sinon.assert.calledOnceWithExactly(trashStub.moveToTrash, workspacePath);
    sinon.assert.calledWith(worktreeStub.pruneWorktrees, '/source/repo1');
    sinon.assert.calledWith(worktreeStub.pruneWorktrees, '/source/repo2');
    sinon.assert.calledOnceWithExactly(trashStub.deleteInBackground, trashedPath);
    // Git only treats a worktree as prunable once its directory is gone
    sinon.assert.callOrder(trashStub.moveToTrash, worktreeStub.pruneWorktrees, trashStub.deleteInBackground);

    expect(result.worktreesRemoved).toBe(2);
    expect(result.worktreesTotal).toBe(2);
    expect(result.workspaceDirRemoved).toBe(true);
    expect(result.trashedPath).toBe(trashedPath);
    expect(result.removalErrors).toEqual([]);
  });

  it('should not prune anything when moving the workspace to trash fails', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    statusStub.checkAllWorktrees.resolves([clean('repo1')]);
    trashStub.moveToTrash.throws(new Error('EACCES: permission denied'));

    await expect(
      useCase.execute({
        workspacePath,
        branchName: 'my-feature',
        sourcePath,
        tmux: false,
      })
    ).rejects.toThrow('EACCES');

    expect(worktreeStub.pruneWorktrees.called).toBe(false);
    expect(trashStub.deleteInBackground.called).toBe(false);
  });

  it('should still delete the trashed workspace when pruning a repo fails, reporting the error', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`, `${workspacePath}/repo2`]);
    statusStub.checkAllWorktrees.resolves([clean('repo1'), clean('repo2')]);
    worktreeStub.pruneWorktrees.withArgs('/source/repo1').rejects({ stderr: 'fatal: bad repo' });

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    expect(result.worktreesRemoved).toBe(1);
    expect(result.removalErrors).toEqual([{ repo: 'repo1', error: 'fatal: bad repo' }]);
    sinon.assert.calledOnceWithExactly(trashStub.deleteInBackground, trashedPath);
  });

  it('should trash the workspace directory even with no worktrees', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: false,
    });

    expect(statusStub.checkAllWorktrees.called).toBe(false);
    sinon.assert.calledOnceWithExactly(trashStub.moveToTrash, workspacePath);
    sinon.assert.calledOnceWithExactly(trashStub.deleteInBackground, trashedPath);
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

  it('should not report a kill when there was no tmux session', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);
    tmuxStub.killSession.resolves(false);

    const result = await useCase.execute({
      workspacePath,
      branchName: 'my-feature',
      sourcePath,
      tmux: true,
    });

    expect(result.tmuxKilled).toBe(false);
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
    statusStub.checkAllWorktrees.resolves([clean('missing-repo')]);
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
    expect(worktreeStub.pruneWorktrees.called).toBe(false);
  });
});
