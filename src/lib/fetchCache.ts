import path from 'path';
import { IFileSystem } from '../adapters/types.js';

interface FetchCacheData {
  [repoPath: string]: number; // timestamp in milliseconds
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
    const cachedTimestamp = cache[repoPath];

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
      cache[repoPath] = Date.now();
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
   * Load cache from disk
   * @returns Cache data object
   */
  private loadCache(): FetchCacheData {
    const cachePath = this.getFetchCachePath();

    try {
      if (!this.fs.existsSync(cachePath)) {
        return {};
      }

      const content = this.fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Corrupted cache - delete and start fresh
      console.warn('Warning: Corrupted fetch cache, resetting:', error);
      try {
        this.fs.rmSync(cachePath, { force: true });
      } catch {
        // Ignore errors deleting corrupted cache
      }
      return {};
    }
  }

  /**
   * Save cache to disk
   * @param cache Cache data to save
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
   * @returns Absolute path to ~/.config/flow/fetch-cache.json
   */
  private getFetchCachePath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.config', 'flow', 'fetch-cache.json');
  }
}
