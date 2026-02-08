import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { DiscoverPrunableWorkspacesUseCase } from '../discoverPrunableWorkspaces.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { FetchService } from '../../lib/fetch.js';
import type { StatusService } from '../../lib/status.js';
import type { GitService } from '../../lib/git.js';
import type { WorktreeStatus } from '../../lib/status.js';

describe('DiscoverPrunableWorkspacesUseCase', () => {
  let useCase: DiscoverPrunableWorkspacesUseCase;
  let workspaceDirStub: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let fetchStub: sinon.SinonStubbedInstance<FetchService>;
  let statusStub: sinon.SinonStubbedInstance<StatusService>;
  let gitStub: sinon.SinonStubbedInstance<GitService>;

  beforeEach(() => {
    workspaceDirStub = {
      listWorkspaces: sinon.stub(),
      getWorktreeDirs: sinon.stub(),
    } as any;

    fetchStub = {
      fetchRepos: sinon.stub().resolves(),
    } as any;

    statusStub = {
      checkAllWorktrees: sinon.stub(),
    } as any;

    gitStub = {
      getLastCommitDate: sinon.stub(),
    } as any;

    useCase = new DiscoverPrunableWorkspacesUseCase(
      workspaceDirStub as any,
      fetchStub as any,
      statusStub as any,
      gitStub as any
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return empty list when no workspaces exist', async () => {
    workspaceDirStub.listWorkspaces.returns([]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toEqual([]);
    sinon.assert.calledOnceWithExactly(workspaceDirStub.listWorkspaces, '/dest');
  });

  it('should skip workspaces with no worktrees', async () => {
    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 0 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns([]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toEqual([]);
    sinon.assert.notCalled(fetchStub.fetchRepos);
  });

  it('should include workspace when all worktrees have no issues and are old enough', async () => {
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 2 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns([
      '/dest/feature/repo1',
      '/dest/feature/repo2',
    ]);

    const cleanStatus: WorktreeStatus = { type: 'clean' };
    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: cleanStatus },
      { repoName: 'repo2', status: cleanStatus },
    ]);

    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo1')
      .resolves(eightDaysAgo);
    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo2')
      .resolves(tenDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toHaveLength(1);
    expect(result.prunable[0]).toMatchObject({
      name: 'feature',
      path: '/dest/feature',
      repoCount: 2,
      oldestCommitDate: eightDaysAgo,
    });
    expect(result.prunable[0].statuses).toHaveLength(2);
  });

  it('should exclude workspace if any worktree has uncommitted changes', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 2 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns([
      '/dest/feature/repo1',
      '/dest/feature/repo2',
    ]);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'uncommitted' } },
      { repoName: 'repo2', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate.resolves(tenDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toEqual([]);
  });

  it('should exclude workspace if any worktree is ahead of main', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 1 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns(['/dest/feature/repo1']);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'ahead', comparedTo: 'main' } },
    ]);

    gitStub.getLastCommitDate.resolves(tenDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toEqual([]);
  });

  it('should include workspace if worktree is behind origin (safe to remove)', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 1 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns(['/dest/feature/repo1']);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'behind', comparedTo: 'origin' } },
    ]);

    gitStub.getLastCommitDate.resolves(tenDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toHaveLength(1);
  });

  it('should exclude workspace if any commit is too recent', async () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 2 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns([
      '/dest/feature/repo1',
      '/dest/feature/repo2',
    ]);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean' } },
      { repoName: 'repo2', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo1')
      .resolves(fiveDaysAgo);
    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo2')
      .resolves(tenDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toEqual([]);
  });

  it('should use the oldest commit date as the representative date', async () => {
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 2 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns([
      '/dest/feature/repo1',
      '/dest/feature/repo2',
    ]);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean' } },
      { repoName: 'repo2', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo1')
      .resolves(twentyDaysAgo);
    gitStub.getLastCommitDate
      .withArgs('/dest/feature/repo2')
      .resolves(eightDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toHaveLength(1);
    expect(result.prunable[0].oldestCommitDate).toEqual(eightDaysAgo);
  });

  it('should process multiple workspaces correctly', async () => {
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'old-feature', path: '/dest/old-feature', repoCount: 1 },
      { name: 'new-feature', path: '/dest/new-feature', repoCount: 1 },
    ]);

    workspaceDirStub.getWorktreeDirs
      .withArgs('/dest/old-feature')
      .returns(['/dest/old-feature/repo1']);
    workspaceDirStub.getWorktreeDirs
      .withArgs('/dest/new-feature')
      .returns(['/dest/new-feature/repo1']);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate
      .withArgs('/dest/old-feature/repo1')
      .resolves(eightDaysAgo);
    gitStub.getLastCommitDate
      .withArgs('/dest/new-feature/repo1')
      .resolves(fiveDaysAgo);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    expect(result.prunable).toHaveLength(1);
    expect(result.prunable[0].name).toBe('old-feature');
  });

  it('should fetch all repos once before checking status', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'feature', path: '/dest/feature', repoCount: 1 },
    ]);
    workspaceDirStub.getWorktreeDirs.returns(['/dest/feature/repo1']);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate.resolves(tenDaysAgo);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    sinon.assert.callOrder(
      fetchStub.fetchRepos,
      statusStub.checkAllWorktrees
    );
    // Should fetch the source repo, not the worktree
    sinon.assert.calledOnceWithExactly(fetchStub.fetchRepos, ['/source/repo1']);
  });

  it('should fetch all repos from all workspaces only once', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    workspaceDirStub.listWorkspaces.returns([
      { name: 'workspace1', path: '/dest/workspace1', repoCount: 2 },
      { name: 'workspace2', path: '/dest/workspace2', repoCount: 1 },
    ]);

    workspaceDirStub.getWorktreeDirs
      .withArgs('/dest/workspace1')
      .returns(['/dest/workspace1/repo1', '/dest/workspace1/repo2']);
    workspaceDirStub.getWorktreeDirs
      .withArgs('/dest/workspace2')
      .returns(['/dest/workspace2/repo1']);

    statusStub.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: { type: 'clean' } },
    ]);

    gitStub.getLastCommitDate.resolves(tenDaysAgo);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      mainBranch: 'master',
      daysOld: 7,
    });

    // Should only call fetch once with unique source repos
    // Note: repo1 appears in both workspaces but should only be fetched once
    sinon.assert.calledOnce(fetchStub.fetchRepos);
    const fetchArgs = fetchStub.fetchRepos.firstCall.args[0];
    expect(fetchArgs).toHaveLength(2); // Only 2 unique repos: repo1 and repo2
    expect(fetchArgs).toContain('/source/repo1');
    expect(fetchArgs).toContain('/source/repo2');
  });
});
