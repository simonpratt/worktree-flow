import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RenameWorkspaceFolderUseCase } from '../renameWorkspaceFolder.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { GitService } from '../../lib/git.js';
import type { RepoService } from '../../lib/repos.js';

describe('RenameWorkspaceFolderUseCase', () => {
  let useCase: RenameWorkspaceFolderUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let gitStub: sinon.SinonStubbedInstance<GitService>;
  let reposStub: sinon.SinonStubbedInstance<RepoService>;

  const sourcePath = '/source';
  const destPath = '/dest';
  const workspacePath = '/dest/old-feature';
  const newWorkspacePath = '/dest/new-feature';

  const baseParams = {
    workspacePath,
    newBranchName: 'new-feature',
    sourcePath,
    destPath,
  };

  beforeEach(() => {
    workspaceDirStub = {
      getWorktreeDirs: sinon.stub(),
      renameWorkspaceDir: sinon.stub().returns(newWorkspacePath),
    } as any;

    gitStub = {
      repairWorktree: sinon.stub().resolves(),
    } as any;

    reposStub = {
      discoverRepos: sinon.stub().returns(['/source/repo1', '/source/repo2']),
    } as any;

    useCase = new RenameWorkspaceFolderUseCase(
      workspaceDirStub as any,
      gitStub as any,
      reposStub as any
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should move the workspace directory to match the new name', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute(baseParams);

    expect(
      workspaceDirStub.renameWorkspaceDir.calledWith(workspacePath, destPath, 'new-feature')
    ).toBe(true);
    expect(result.newWorkspacePath).toBe(newWorkspacePath);
    expect(result.failedRepos).toEqual([]);
  });

  it('should repair each worktree at its new location after the move', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`, `${workspacePath}/repo2`]);

    await useCase.execute(baseParams);

    sinon.assert.callOrder(workspaceDirStub.renameWorkspaceDir, gitStub.repairWorktree);
    expect(gitStub.repairWorktree.calledWith('/source/repo1', `${newWorkspacePath}/repo1`)).toBe(
      true
    );
    expect(gitStub.repairWorktree.calledWith('/source/repo2', `${newWorkspacePath}/repo2`)).toBe(
      true
    );
  });

  it('should report repos whose repair failed and continue with the rest', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`, `${workspacePath}/repo2`]);
    gitStub.repairWorktree
      .withArgs('/source/repo1', sinon.match.any)
      .rejects(new Error('worktree repair failed'));

    const result = await useCase.execute(baseParams);

    expect(result.failedRepos).toEqual([{ repoName: 'repo1', error: 'worktree repair failed' }]);
    expect(gitStub.repairWorktree.calledWith('/source/repo2', `${newWorkspacePath}/repo2`)).toBe(
      true
    );
  });

  it('should report "source repo not found" without attempting a repair', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/missing-repo`]);
    reposStub.discoverRepos.returns(['/source/repo1']);

    const result = await useCase.execute(baseParams);

    expect(result.failedRepos).toEqual([
      { repoName: 'missing-repo', error: 'source repo not found' },
    ]);
    expect(gitStub.repairWorktree.called).toBe(false);
  });

  it('should not repair anything when the move itself fails', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    workspaceDirStub.renameWorkspaceDir.throws(new Error('already exists'));

    await expect(useCase.execute(baseParams)).rejects.toThrow('already exists');
    expect(gitStub.repairWorktree.called).toBe(false);
  });
});
