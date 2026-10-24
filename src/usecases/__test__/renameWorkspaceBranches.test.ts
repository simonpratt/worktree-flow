import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RenameWorkspaceBranchesUseCase } from '../renameWorkspaceBranches.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { GitService } from '../../lib/git.js';
import type { RepoService } from '../../lib/repos.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';

describe('RenameWorkspaceBranchesUseCase', () => {
  let useCase: RenameWorkspaceBranchesUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let gitStub: sinon.SinonStubbedInstance<GitService>;
  let reposStub: sinon.SinonStubbedInstance<RepoService>;
  let workspaceConfigStub: sinon.SinonStubbedInstance<WorkspaceConfigService>;

  const sourcePath = '/source';
  const workspacePath = '/dest/old-feature';

  const baseParams = {
    workspacePath,
    newBranchName: 'new-feature',
    sourcePath,
  };

  beforeEach(() => {
    workspaceDirStub = {
      getWorktreeDirs: sinon.stub(),
      renameWorkspaceDir: sinon.stub(),
    } as any;

    gitStub = {
      getCurrentBranch: sinon.stub().resolves('old-feature'),
      hasLocalBranch: sinon.stub().resolves(false),
      createBranch: sinon.stub().resolves(),
      checkout: sinon.stub().resolves(),
    } as any;

    reposStub = {
      discoverRepos: sinon.stub().returns(['/source/repo1', '/source/repo2']),
    } as any;

    workspaceConfigStub = {
      setBranchName: sinon.stub(),
    } as any;

    useCase = new RenameWorkspaceBranchesUseCase(
      workspaceDirStub as any,
      workspaceConfigStub as any,
      gitStub as any,
      reposStub as any
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should branch and checkout each worktree in place without moving it', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);

    const result = await useCase.execute(baseParams);

    expect(workspaceDirStub.renameWorkspaceDir.called).toBe(false);
    expect(gitStub.getCurrentBranch.calledWith(`${workspacePath}/repo1`)).toBe(true);
    expect(gitStub.createBranch.calledWith('/source/repo1', 'new-feature', 'old-feature')).toBe(
      true
    );
    expect(gitStub.checkout.calledWith(`${workspacePath}/repo1`, 'new-feature')).toBe(true);
    expect(result.repoResults).toEqual([{ repoName: 'repo1' }]);
  });

  it('should persist the new branch name in the existing workspace config', async () => {
    workspaceDirStub.getWorktreeDirs.returns([]);

    await useCase.execute({ ...baseParams, newBranchName: 'feature/new' });

    sinon.assert.calledOnceWithExactly(
      workspaceConfigStub.setBranchName,
      workspacePath,
      'feature/new'
    );
  });

  it('should skip branch creation when the new branch already exists locally', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/repo1`]);
    gitStub.hasLocalBranch.resolves(true);

    await useCase.execute(baseParams);

    expect(gitStub.createBranch.called).toBe(false);
    expect(gitStub.checkout.calledOnce).toBe(true);
  });

  it('should record a per-repo error and continue when a repo fails', async () => {
    workspaceDirStub.getWorktreeDirs.returns([
      `${workspacePath}/repo1`,
      `${workspacePath}/repo2`,
    ]);
    gitStub.checkout
      .withArgs(`${workspacePath}/repo1`, sinon.match.any)
      .rejects(new Error('checkout failed'));

    const result = await useCase.execute(baseParams);

    expect(result.repoResults).toContainEqual({ repoName: 'repo1', error: 'checkout failed' });
    expect(result.repoResults).toContainEqual({ repoName: 'repo2' });
  });

  it('should record "source repo not found" without touching git', async () => {
    workspaceDirStub.getWorktreeDirs.returns([`${workspacePath}/missing-repo`]);
    reposStub.discoverRepos.returns(['/source/repo1']);

    const result = await useCase.execute(baseParams);

    expect(result.repoResults).toEqual([
      { repoName: 'missing-repo', error: 'source repo not found' },
    ]);
    expect(gitStub.getCurrentBranch.called).toBe(false);
  });

  it('should leave skipped repos untouched and omit them from the results', async () => {
    workspaceDirStub.getWorktreeDirs.returns([
      `${workspacePath}/repo1`,
      `${workspacePath}/repo2`,
    ]);

    const result = await useCase.execute({ ...baseParams, skipRepos: ['repo1'] });

    expect(gitStub.getCurrentBranch.calledWith(`${workspacePath}/repo1`)).toBe(false);
    expect(gitStub.checkout.calledWith(`${workspacePath}/repo1`, sinon.match.any)).toBe(false);
    expect(gitStub.checkout.calledWith(`${workspacePath}/repo2`, 'new-feature')).toBe(true);
    expect(result.repoResults).toEqual([{ repoName: 'repo2' }]);
  });
});
