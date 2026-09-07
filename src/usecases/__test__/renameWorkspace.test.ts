import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RenameWorkspaceUseCase } from '../renameWorkspace.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { GitService } from '../../lib/git.js';
import type { TmuxService } from '../../lib/tmux.js';
import type { RepoService } from '../../lib/repos.js';

describe('RenameWorkspaceUseCase', () => {
  let useCase: RenameWorkspaceUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let gitStub: sinon.SinonStubbedInstance<GitService>;
  let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;
  let reposStub: sinon.SinonStubbedInstance<RepoService>;

  const sourcePath = '/source';
  const destPath = '/dest';
  const workspacePath = '/dest/old-feature';
  const newWorkspacePath = '/dest/new-feature';

  beforeEach(() => {
    workspaceDirStub = {
      getWorktreeDirs: sinon.stub(),
      renameWorkspaceDir: sinon.stub().returns(newWorkspacePath),
    } as any;

    gitStub = {
      repairWorktree: sinon.stub().resolves(),
      getCurrentBranch: sinon.stub().resolves('old-feature'),
      hasLocalBranch: sinon.stub().resolves(false),
      createBranch: sinon.stub().resolves(),
      checkout: sinon.stub().resolves(),
    } as any;

    tmuxStub = {
      sessionExists: sinon.stub().resolves(false),
      renameSession: sinon.stub().resolves(),
    } as any;

    reposStub = {
      discoverRepos: sinon.stub().returns(['/source/repo1', '/source/repo2']),
    } as any;

    useCase = new RenameWorkspaceUseCase(
      workspaceDirStub as any,
      gitStub as any,
      tmuxStub as any,
      reposStub as any
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should rename the workspace directory before touching any repo', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(
      workspaceDirStub.renameWorkspaceDir.calledWith(workspacePath, destPath, 'new-feature')
    ).toBe(true);
    expect(result.newWorkspacePath).toBe(newWorkspacePath);
  });

  it('should repair, branch, and checkout each worktree at its new location', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(gitStub.repairWorktree.calledWith('/source/repo1', `${newWorkspacePath}/repo1`)).toBe(
      true
    );
    expect(gitStub.getCurrentBranch.calledWith(`${newWorkspacePath}/repo1`)).toBe(true);
    expect(gitStub.createBranch.calledWith('/source/repo1', 'new-feature', 'old-feature')).toBe(
      true
    );
    expect(gitStub.checkout.calledWith(`${newWorkspacePath}/repo1`, 'new-feature')).toBe(true);
    expect(result.repoResults).toEqual([{ repoName: 'repo1' }]);
  });

  it('should skip branch creation when the new branch already exists locally', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    gitStub.hasLocalBranch.resolves(true);

    await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(gitStub.createBranch.called).toBe(false);
    expect(gitStub.checkout.calledOnce).toBe(true);
  });

  it('should record a per-repo error and continue when a repo fails', async () => {
    workspaceDirStub.getWorktreeDirs.returns([
      `${workspacePath}/repo1`,
      `${workspacePath}/repo2`,
    ]);
    gitStub.repairWorktree.withArgs('/source/repo1', sinon.match.any).rejects(
      new Error('worktree repair failed')
    );

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(result.repoResults).toContainEqual({
      repoName: 'repo1',
      error: 'worktree repair failed',
    });
    expect(result.repoResults).toContainEqual({ repoName: 'repo2' });
  });

  it('should record "source repo not found" when the repo no longer exists in source, without touching git', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/missing-repo`]);
    reposStub.discoverRepos.returns(['/source/repo1']);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(result.repoResults).toEqual([
      { repoName: 'missing-repo', error: 'source repo not found' },
    ]);
    expect(gitStub.repairWorktree.called).toBe(false);
    expect(gitStub.getCurrentBranch.called).toBe(false);
  });

  it('should rename the tmux session when tmux is enabled and a session exists', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);
    tmuxStub.sessionExists.resolves(true);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: true,
    });

    expect(tmuxStub.renameSession.calledWith('old-feature', 'new-feature')).toBe(true);
    expect(result.tmuxRenamed).toBe(true);
  });

  it('should not attempt to rename the tmux session when none exists', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);
    tmuxStub.sessionExists.resolves(false);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: true,
    });

    expect(tmuxStub.renameSession.called).toBe(false);
    expect(result.tmuxRenamed).toBe(false);
  });

  it('should not fail the rename if the tmux rename itself throws', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);
    tmuxStub.sessionExists.resolves(true);
    tmuxStub.renameSession.rejects(new Error('tmux error'));

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: true,
    });

    expect(result.tmuxRenamed).toBe(false);
  });

  it('should not attempt tmux operations when tmux is disabled', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(tmuxStub.sessionExists.called).toBe(false);
  });

  it('should handle workspaces with zero worktrees', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute({
      workspacePath,
      oldBranchName: 'old-feature',
      newBranchName: 'new-feature',
      sourcePath,
      destPath,
      tmux: false,
    });

    expect(result.repoResults).toEqual([]);
    expect(workspaceDirStub.renameWorkspaceDir.calledOnce).toBe(true);
  });
});
