import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { FetchAllReposUseCase } from '../fetchAllRepos.js';
import type { FetchService } from '../../lib/fetch.js';
import type { RepoService } from '../../lib/repos.js';

describe('FetchAllReposUseCase', () => {
  let fetch: sinon.SinonStubbedInstance<FetchService>;
  let repos: sinon.SinonStubbedInstance<RepoService>;
  let useCase: FetchAllReposUseCase;

  beforeEach(() => {
    fetch = {
      fetchRepos: sinon.stub().resolves(),
    } as any;

    repos = {
      discoverRepos: sinon.stub(),
    } as any;

    useCase = new FetchAllReposUseCase(fetch, repos);
  });

  it('should discover and fetch all repos from source path with ttl', async () => {
    const discoveredRepos = ['/source/repo1', '/source/repo2', '/source/repo3'];
    repos.discoverRepos.withArgs('/source').returns(discoveredRepos);

    await useCase.execute({
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(repos.discoverRepos);
    sinon.assert.calledWith(repos.discoverRepos, '/source');
    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(fetch.fetchRepos, discoveredRepos, { ttlSeconds: 300 });
  });

  it('should handle source path with no repos', async () => {
    repos.discoverRepos.withArgs('/empty').returns([]);

    await useCase.execute({
      sourcePath: '/empty',
      fetchCacheTtlSeconds: 300,
    });

    sinon.assert.calledOnce(fetch.fetchRepos);
    sinon.assert.calledWith(fetch.fetchRepos, [], { ttlSeconds: 300 });
  });

  it('should pass through ttl of 0 to disable caching', async () => {
    repos.discoverRepos.returns(['/source/repo1']);

    await useCase.execute({
      sourcePath: '/source',
      fetchCacheTtlSeconds: 0,
    });

    sinon.assert.calledWith(fetch.fetchRepos, ['/source/repo1'], { ttlSeconds: 0 });
  });

  it('should propagate fetch errors', async () => {
    repos.discoverRepos.returns(['/source/repo1']);
    const error = new Error('Network error');
    fetch.fetchRepos.rejects(error);

    await expect(useCase.execute({
      sourcePath: '/source',
      fetchCacheTtlSeconds: 300,
    })).rejects.toThrow('Network error');
  });
});
