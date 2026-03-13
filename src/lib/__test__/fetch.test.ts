import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { FetchService } from '../fetch.js';
import { GitService } from '../git.js';
import { FetchCacheService } from '../fetchCache.js';
import { createMockShell, createMockConsole } from '../../test/test-utils.js';

describe('FetchService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let console: sinon.SinonStubbedInstance<any>;
  let git: GitService;
  let gitStub: sinon.SinonStubbedInstance<GitService>;
  let cache: FetchCacheService;
  let cacheStub: sinon.SinonStubbedInstance<FetchCacheService>;
  let service: FetchService;

  beforeEach(() => {
    shell = createMockShell();
    console = createMockConsole();
    git = new GitService(shell as any);
    gitStub = sinon.stub(git);
    cache = new FetchCacheService({} as any);
    cacheStub = sinon.stub(cache);
    service = new FetchService(gitStub as any, console as any, cacheStub as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('fetchRepos', () => {
    it('should call git.fetch for each repo', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0); // Return all repos (no cache hits)

      await service.fetchRepos(['/repo1', '/repo2', '/repo3']);

      expect(gitStub.fetch.callCount).toBe(3);
      sinon.assert.calledWith(gitStub.fetch, '/repo1');
      sinon.assert.calledWith(gitStub.fetch, '/repo2');
      sinon.assert.calledWith(gitStub.fetch, '/repo3');
    });

    it('should write progress updates', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);

      await service.fetchRepos(['/repo1', '/repo2']);

      // Should write progress at least once
      sinon.assert.called(console.write);
      // Should have progress messages
      const progressWrites = console.write.getCalls().filter((call: sinon.SinonSpyCall) =>
        call.args[0].includes('Fetching')
      );
      expect(progressWrites.length).toBeGreaterThan(0);
    });

    it('should log final success message when all succeed', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2', '/repo3']);

      sinon.assert.called(console.log);
      const lastLog = console.log.lastCall.args[0];
      expect(lastLog).toContain('Fetched 3 repos');
      expect(lastLog).toContain('✓');
    });

    it('should handle fetch failures gracefully', async () => {
      gitStub.fetch.onFirstCall().resolves();
      gitStub.fetch.onSecondCall().rejects(new Error('Network error'));
      gitStub.fetch.onThirdCall().resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2', '/repo3']);

      expect(gitStub.fetch.callCount).toBe(3);
      sinon.assert.called(console.log);
      const lastLog = console.log.lastCall.args[0];
      expect(lastLog).toContain('Fetched 2/3 repos');
      expect(lastLog).toContain('1 failed');
    });

    it('should show failed count when all fail', async () => {
      gitStub.fetch.rejects(new Error('Network error'));
      cacheStub.filterReposToFetch.returnsArg(0);

      await service.fetchRepos(['/repo1', '/repo2']);

      const lastLog = console.log.lastCall.args[0];
      expect(lastLog).toContain('Fetched 0/2 repos');
      expect(lastLog).toContain('2 failed');
    });

    it('should clear progress line before final message', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1']);

      // Should have written '\r\x1b[K' to clear the line
      const clearCalls = console.write.getCalls().filter((call: sinon.SinonSpyCall) => call.args[0] === '\r\x1b[K');
      expect(clearCalls.length).toBeGreaterThan(0);
    });

    it('should not do anything for empty repos array', async () => {
      await service.fetchRepos([]);

      sinon.assert.notCalled(gitStub.fetch);
      sinon.assert.notCalled(console.write);
      sinon.assert.notCalled(console.log);
    });

    it('should process repos with controlled concurrency', async () => {
      const repos = Array.from({ length: 20 }, (_, i) => `/repo${i}`);
      let currentlyRunning = 0;
      let maxConcurrent = 0;

      gitStub.fetch.callsFake(async () => {
        currentlyRunning++;
        maxConcurrent = Math.max(maxConcurrent, currentlyRunning);
        await new Promise(resolve => setTimeout(resolve, 10));
        currentlyRunning--;
      });
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(repos);

      expect(gitStub.fetch.callCount).toBe(20);
      // FETCH_CONCURRENCY is 8, so should not exceed that
      expect(maxConcurrent).toBeLessThanOrEqual(8);
    });

    it('should update progress percentage correctly', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2']);

      const progressCalls = console.write.getCalls().filter((call: sinon.SinonSpyCall) =>
        call.args[0].includes('%')
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      // Should show progress increasing
      const hasHundredPercent = progressCalls.some((call: sinon.SinonSpyCall) =>
        call.args[0].includes('100%')
      );
      expect(hasHundredPercent).toBe(true);
    });

    it('should skip fetching when all repos are cached', async () => {
      cacheStub.filterReposToFetch.returns([]); // All repos cached

      await service.fetchRepos(['/repo1', '/repo2', '/repo3']);

      sinon.assert.notCalled(gitStub.fetch);
      sinon.assert.called(console.log);
      const lastLog = console.log.lastCall.args[0];
      expect(lastLog).toContain('All 3 repos up to date (cached)');
    });

    it('should show cached count when some repos are cached', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returns(['/repo2']); // Only repo2 needs fetching
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2', '/repo3']);

      expect(gitStub.fetch.callCount).toBe(1);
      sinon.assert.calledWith(gitStub.fetch, '/repo2');

      const lastLog = console.log.lastCall.args[0];
      expect(lastLog).toContain('Fetched 1 repo');
      expect(lastLog).toContain('2 cached');
    });

    it('should update cache after successful fetch', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2']);

      expect(cacheStub.markFetched.callCount).toBe(2);
      sinon.assert.calledWith(cacheStub.markFetched, '/repo1');
      sinon.assert.calledWith(cacheStub.markFetched, '/repo2');
    });

    it('should not update cache on fetch failure', async () => {
      gitStub.fetch.onFirstCall().resolves();
      gitStub.fetch.onSecondCall().rejects(new Error('Network error'));
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2']);

      // Only successful fetch should update cache
      expect(cacheStub.markFetched.callCount).toBe(1);
      sinon.assert.calledWith(cacheStub.markFetched, '/repo1');
      sinon.assert.neverCalledWith(cacheStub.markFetched, '/repo2');
    });

    it('should pass ttlSeconds to cache filter', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2'], { ttlSeconds: 600 });

      sinon.assert.calledWith(cacheStub.filterReposToFetch, ['/repo1', '/repo2'], 600);
    });

    it('should use default TTL of 300 when not specified', async () => {
      gitStub.fetch.resolves();
      cacheStub.filterReposToFetch.returnsArg(0);
      cacheStub.markFetched.returns();

      await service.fetchRepos(['/repo1', '/repo2']);

      sinon.assert.calledWith(cacheStub.filterReposToFetch, ['/repo1', '/repo2'], 300);
    });
  });
});
