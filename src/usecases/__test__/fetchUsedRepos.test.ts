import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { FetchUsedReposUseCase } from '../fetchUsedRepos.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { FetchService } from '../../lib/fetch.js';

describe('FetchUsedReposUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let fetch: sinon.SinonStubbedInstance<FetchService>;
  let useCase: FetchUsedReposUseCase;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub(),
      listWorkspaces: sinon.stub(),
    } as any;

    fetch = {
      fetchRepos: sinon.stub().resolves(),
    } as any;

    useCase = new FetchUsedReposUseCase(workspaceDir, fetch);
  });

  it('should fetch repos from all workspaces', async () => {
    workspaceDir.listWorkspaces.withArgs('/dest').returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 2 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-b')
      .returns(['/dest/feature-b/repo1']);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(fetch.fetchRepos);
    // Should deduplicate repo1 which appears in both workspaces
    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1', '/source/repo2'],
      { silent: false, ttlSeconds: 300 }
    );
  });

  it('should handle empty workspaces list', async () => {
    workspaceDir.listWorkspaces.withArgs('/dest').returns([]);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(fetch.fetchRepos, [], { silent: false, ttlSeconds: 300 });
  });

  it('should default to silent=false when not specified', async () => {
    workspaceDir.listWorkspaces.withArgs('/dest').returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    const callArgs = fetch.fetchRepos.firstCall.args[1];
    expect(callArgs?.silent).toBe(false);
  });

  it('should respect silent=true when explicitly passed', async () => {
    workspaceDir.listWorkspaces.withArgs('/dest').returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
      silent: true,
    });

    const callArgs = fetch.fetchRepos.firstCall.args[1];
    expect(callArgs?.silent).toBe(true);
  });

  it('should pass through ttl of 0 to disable caching', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'ws', path: '/dest/ws', repoCount: 1 },
    ]);
    workspaceDir.getWorktreeDirs.returns(['/dest/ws/repo1']);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 0,
    });

    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1'],
      { silent: false, ttlSeconds: 0 }
    );
  });

  it('should propagate fetch errors', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'ws', path: '/dest/ws', repoCount: 1 },
    ]);
    workspaceDir.getWorktreeDirs.returns(['/dest/ws/repo1']);
    const error = new Error('Network error');
    fetch.fetchRepos.rejects(error);

    await expect(useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    })).rejects.toThrow('Network error');
  });

  it('should handle workspaces with no worktrees', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'empty', path: '/dest/empty', repoCount: 0 },
    ]);
    workspaceDir.getWorktreeDirs.withArgs('/dest/empty').returns([]);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(fetch.fetchRepos, [], { silent: false, ttlSeconds: 300 });
  });

  it('should deduplicate repos across multiple workspaces', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'ws1', path: '/dest/ws1', repoCount: 2 },
      { name: 'ws2', path: '/dest/ws2', repoCount: 2 },
      { name: 'ws3', path: '/dest/ws3', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/ws1')
      .returns(['/dest/ws1/repo1', '/dest/ws1/repo2']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/ws2')
      .returns(['/dest/ws2/repo1', '/dest/ws2/repo3']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/ws3')
      .returns(['/dest/ws3/repo2']);

    await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    // Should have unique repos: repo1, repo2, repo3
    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1', '/source/repo2', '/source/repo3'],
      { silent: false, ttlSeconds: 300 }
    );
  });
});
