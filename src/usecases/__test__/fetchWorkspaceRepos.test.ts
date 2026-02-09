import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { FetchWorkspaceReposUseCase } from '../fetchWorkspaceRepos.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { FetchService } from '../../lib/fetch.js';

describe('FetchWorkspaceReposUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let fetch: sinon.SinonStubbedInstance<FetchService>;
  let useCase: FetchWorkspaceReposUseCase;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub(),
    } as any;

    fetch = {
      fetchRepos: sinon.stub().resolves(),
    } as any;

    useCase = new FetchWorkspaceReposUseCase(workspaceDir, fetch);
  });

  it('should fetch source repos for all worktrees in workspace', async () => {
    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    await useCase.execute({
      workspacePath: '/dest/feature-a',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1', '/source/repo2'],
      { silent: true, ttlSeconds: 300 }
    );
  });

  it('should handle workspace with no worktrees', async () => {
    workspaceDir.getWorktreeDirs.withArgs('/dest/empty').returns([]);

    await useCase.execute({
      workspacePath: '/dest/empty',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    // Should still call fetchRepos with empty array
    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(fetch.fetchRepos, [], { silent: true, ttlSeconds: 300 });
  });

  it('should fetch with silent=true to avoid UI jumping', async () => {
    workspaceDir.getWorktreeDirs.returns(['/dest/ws/repo1']);

    await useCase.execute({
      workspacePath: '/dest/ws',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    const callArgs = fetch.fetchRepos.firstCall.args[1];
    expect(callArgs?.silent).toBe(true);
  });

  it('should pass through ttl of 0 to disable caching', async () => {
    workspaceDir.getWorktreeDirs.returns(['/dest/ws/repo1']);

    await useCase.execute({
      workspacePath: '/dest/ws',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 0,
    });

    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1'],
      { silent: true, ttlSeconds: 0 }
    );
  });

  it('should deduplicate repos when workspace has duplicate repo names', async () => {
    // Edge case: if a workspace somehow has duplicate worktrees (shouldn't happen but be defensive)
    workspaceDir.getWorktreeDirs.returns([
      '/dest/ws/repo1',
      '/dest/ws/repo1',
      '/dest/ws/repo2',
    ]);

    await useCase.execute({
      workspacePath: '/dest/ws',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    // Should deduplicate to unique repos
    sinon.assert.calledWith(
      fetch.fetchRepos,
      ['/source/repo1', '/source/repo2'],
      { silent: true, ttlSeconds: 300 }
    );
  });

  it('should propagate fetch errors', async () => {
    workspaceDir.getWorktreeDirs.returns(['/dest/ws/repo1']);
    const error = new Error('Network error');
    fetch.fetchRepos.rejects(error);

    await expect(useCase.execute({
      workspacePath: '/dest/ws',
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    })).rejects.toThrow('Network error');
  });
});
