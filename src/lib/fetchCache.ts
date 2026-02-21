import path from 'path';
import { IFileSystem } from '../adapters/types.js';

interface BranchRepoEvent {
  repo: string;
  date: string;
}

interface FetchCacheData {
  fetchTimestamps: { [repoPath: string]: number };
  branchRepoUsage: BranchRepoEvent[];
}

export class FetchCacheService {
  constructor(private fs: IFileSystem) {}

  /**
   * Check if a repository needs fetching based on TTL
   * @param repoPath Absolute path to repository
   * @param ttlSeconds TTL in seconds (0 = always fetch)
   * @returns true if repo should be fetched
   */
  shouldFetch(repoPath: string, ttlSeconds: number): boolean {
    if (ttlSeconds === 0) {
      return true; // Caching disabled
    }

    const cache = this.loadCache();
    const cachedTimestamp = cache.fetchTimestamps[repoPath];

    if (!cachedTimestamp) {
      return true; // Cache miss
    }

    const now = Date.now();
    const age = now - cachedTimestamp;
    const ttlMs = ttlSeconds * 1000;

    return age > ttlMs; // Expired if older than TTL
  }

  /**
   * Mark a repository as fetched with current timestamp
   * @param repoPath Absolute path to repository
   */
  markFetched(repoPath: string): void {
    try {
      const cache = this.loadCache();
      cache.fetchTimestamps[repoPath] = Date.now();
      this.saveCache(cache);
    } catch (error) {
      // Don't block operations on cache write errors
      console.warn('Warning: Failed to update fetch cache:', error);
    }
  }

  /**
   * Filter repositories to only those that need fetching
   * @param repoPaths Array of absolute repository paths
   * @param ttlSeconds TTL in seconds
   * @returns Array of repos that need fetching
   */
  filterReposToFetch(repoPaths: string[], ttlSeconds: number): string[] {
    return repoPaths.filter(repoPath => this.shouldFetch(repoPath, ttlSeconds));
  }

  /**
   * Record that a branch was created from these repos (appends raw events)
   * @param repoNames Array of repository names (basenames)
   */
  trackBranchUsage(repoNames: string[]): void {
    try {
      const cache = this.loadCache();
      const date = new Date().toISOString();
      for (const repo of repoNames) {
        cache.branchRepoUsage.push({ repo, date });
      }
      this.saveCache(cache);
    } catch (error) {
      // Don't block operations on cache write errors
      console.warn('Warning: Failed to update branch usage cache:', error);
    }
  }

  /**
   * Get the most recently used repo names, derived from raw events
   * @param limit Maximum number of repos to return
   * @returns Repo names sorted by most recent usage, descending
   */
  getRecentlyUsedRepos(limit: number): string[] {
    const events = this.loadCache().branchRepoUsage;
    const latestByRepo = new Map<string, string>();
    for (const event of events) {
      const existing = latestByRepo.get(event.repo);
      if (!existing || event.date > existing) {
        latestByRepo.set(event.repo, event.date);
      }
    }
    return [...latestByRepo.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, limit)
      .map(([repo]) => repo);
  }

  /**
   * Load cache from disk
   */
  private loadCache(): FetchCacheData {
    const cachePath = this.getFetchCachePath();

    try {
      if (!this.fs.existsSync(cachePath)) {
        return { fetchTimestamps: {}, branchRepoUsage: [] };
      }

      const content = this.fs.readFileSync(cachePath, 'utf-8');
      const parsed = JSON.parse(content);

      return {
        fetchTimestamps: parsed.fetchTimestamps ?? {},
        branchRepoUsage: parsed.branchRepoUsage ?? [],
      };
    } catch (error) {
      // Corrupted cache - delete and start fresh
      console.warn('Warning: Corrupted fetch cache, resetting:', error);
      try {
        this.fs.rmSync(cachePath, { force: true });
      } catch {
        // Ignore errors deleting corrupted cache
      }
      return { fetchTimestamps: {}, branchRepoUsage: [] };
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(cache: FetchCacheData): void {
    const cachePath = this.getFetchCachePath();
    const cacheDir = path.dirname(cachePath);

    // Ensure cache directory exists
    if (!this.fs.existsSync(cacheDir)) {
      this.fs.mkdirSync(cacheDir, { recursive: true });
    }

    this.fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  }

  /**
   * Get path to fetch cache file
   */
  private getFetchCachePath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.config', 'flow', 'flow-cache.json');
  }
}
