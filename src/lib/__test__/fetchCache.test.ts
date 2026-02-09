import { describe, it, expect, beforeEach } from 'vitest';
import { FetchCacheService } from '../fetchCache.js';
import { createMemFs } from '../../test/test-utils.js';
import path from 'node:path';

describe('FetchCacheService', () => {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const cachePath = path.join(home, '.config', 'flow', 'fetch-cache.json');

  function createService() {
    const { fs, vol } = createMemFs();
    const service = new FetchCacheService(fs);
    return { fs, vol, service };
  }

  describe('shouldFetch', () => {
    it('should return true when cache file does not exist', () => {
      const { service } = createService();
      const result = service.shouldFetch('/path/to/repo', 300);
      expect(result).toBe(true);
    });

    it('should return true when repo not in cache', () => {
      const { service, vol } = createService();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/other/repo': Date.now()
        })
      });

      const result = service.shouldFetch('/path/to/repo', 300);
      expect(result).toBe(true);
    });

    it('should return false when repo cached and within TTL', () => {
      const { service, vol } = createService();
      const now = Date.now();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/path/to/repo': now - 60000 // 1 minute ago
        })
      });

      const result = service.shouldFetch('/path/to/repo', 300); // 5 minute TTL
      expect(result).toBe(false);
    });

    it('should return true when repo cached but expired TTL', () => {
      const { service, vol } = createService();
      const now = Date.now();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/path/to/repo': now - 360000 // 6 minutes ago
        })
      });

      const result = service.shouldFetch('/path/to/repo', 300); // 5 minute TTL
      expect(result).toBe(true);
    });

    it('should return true when TTL is 0 (caching disabled)', () => {
      const { service, vol } = createService();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/path/to/repo': Date.now()
        })
      });

      const result = service.shouldFetch('/path/to/repo', 0);
      expect(result).toBe(true);
    });

    it('should handle corrupted cache gracefully', () => {
      const { service, vol, fs } = createService();
      vol.fromJSON({
        [cachePath]: 'invalid json {'
      });

      const result = service.shouldFetch('/path/to/repo', 300);
      expect(result).toBe(true);

      // Cache file should be deleted
      expect(fs.existsSync(cachePath)).toBe(false);
    });
  });

  describe('markFetched', () => {
    it('should create cache file with timestamp', () => {
      const { service, fs } = createService();
      const before = Date.now();
      service.markFetched('/path/to/repo');
      const after = Date.now();

      expect(fs.existsSync(cachePath)).toBe(true);

      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8') as string);
      expect(cache['/path/to/repo']).toBeGreaterThanOrEqual(before);
      expect(cache['/path/to/repo']).toBeLessThanOrEqual(after);
    });

    it('should update existing cache entry', () => {
      const { service, fs, vol } = createService();
      const oldTimestamp = Date.now() - 300000; // 5 minutes ago
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/path/to/repo': oldTimestamp,
          '/other/repo': oldTimestamp
        })
      });

      const before = Date.now();
      service.markFetched('/path/to/repo');
      const after = Date.now();

      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8') as string);

      // Updated repo should have new timestamp
      expect(cache['/path/to/repo']).toBeGreaterThanOrEqual(before);
      expect(cache['/path/to/repo']).toBeLessThanOrEqual(after);

      // Other repo should remain unchanged
      expect(cache['/other/repo']).toBe(oldTimestamp);
    });

    it('should create cache directory if missing', () => {
      const { service, fs } = createService();
      const configDir = path.join(home, '.config', 'flow');
      expect(fs.existsSync(configDir)).toBe(false);

      service.markFetched('/path/to/repo');

      expect(fs.existsSync(configDir)).toBe(true);
      expect(fs.existsSync(cachePath)).toBe(true);
    });

    it('should not throw on write errors', () => {
      const { service } = createService();
      // Create service with a mock fs that throws on write
      const mockFs = {
        existsSync: () => false,
        mkdirSync: () => { throw new Error('Permission denied'); },
        readFileSync: () => '',
        writeFileSync: () => { throw new Error('Permission denied'); },
        rmSync: () => {},
      } as any;
      const serviceWithMockFs = new FetchCacheService(mockFs);

      // Should not throw
      expect(() => {
        serviceWithMockFs.markFetched('/path/to/repo');
      }).not.toThrow();
    });
  });

  describe('filterReposToFetch', () => {
    it('should return all repos when cache is empty', () => {
      const { service } = createService();
      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = service.filterReposToFetch(repos, 300);

      expect(result).toEqual(repos);
    });

    it('should filter out cached repos within TTL', () => {
      const { service, vol } = createService();
      const now = Date.now();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/repo1': now - 60000, // 1 minute ago - cached
          '/repo2': now - 360000, // 6 minutes ago - expired
          // /repo3 not in cache
        })
      });

      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = service.filterReposToFetch(repos, 300); // 5 minute TTL

      expect(result).toEqual(['/repo2', '/repo3']);
    });

    it('should return all repos when TTL is 0', () => {
      const { service, vol } = createService();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/repo1': Date.now(),
          '/repo2': Date.now()
        })
      });

      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = service.filterReposToFetch(repos, 0);

      expect(result).toEqual(repos);
    });

    it('should return empty array when all repos cached', () => {
      const { service, vol } = createService();
      const now = Date.now();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/repo1': now - 60000,
          '/repo2': now - 120000,
          '/repo3': now - 180000
        })
      });

      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = service.filterReposToFetch(repos, 300);

      expect(result).toEqual([]);
    });

    it('should handle mixed cache states correctly', () => {
      const { service, vol } = createService();
      const now = Date.now();
      vol.fromJSON({
        [cachePath]: JSON.stringify({
          '/repo1': now - 60000,   // cached
          '/repo3': now - 360000,  // expired
          '/repo5': now - 120000   // cached
        })
      });

      const repos = ['/repo1', '/repo2', '/repo3', '/repo4', '/repo5'];
      const result = service.filterReposToFetch(repos, 300);

      // Should fetch: repo2 (not cached), repo3 (expired), repo4 (not cached)
      expect(result).toEqual(['/repo2', '/repo3', '/repo4']);
    });
  });
});
