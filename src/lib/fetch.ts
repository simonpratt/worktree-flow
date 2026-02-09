import chalk from 'chalk';
import type { IConsole } from '../adapters/types.js';
import type { GitService } from './git.js';
import type { FetchCacheService } from './fetchCache.js';

const FETCH_CONCURRENCY = 8;

/**
 * FetchService handles parallel fetching of multiple repos.
 */
export class FetchService {
  constructor(
    private git: GitService,
    private console: IConsole,
    private cache: FetchCacheService
  ) {}

  async fetchRepos(repoPaths: string[], options?: { silent?: boolean; ttlSeconds?: number }): Promise<void> {
    if (repoPaths.length === 0) {
      return;
    }

    const silent = options?.silent ?? false;
    const ttlSeconds = options?.ttlSeconds ?? 300;

    // Filter repos based on cache
    const reposToFetch = this.cache.filterReposToFetch(repoPaths, ttlSeconds);
    const cachedCount = repoPaths.length - reposToFetch.length;

    // Early return if all repos are cached
    if (reposToFetch.length === 0) {
      if (!silent) {
        this.console.log(`All ${repoPaths.length} repos up to date (cached) ${chalk.green('✓')}`);
      }
      return;
    }

    const total = reposToFetch.length;
    let completed = 0;
    let failed = 0;

    const updateProgress = () => {
      if (silent) return;
      const percent = Math.floor((completed / total) * 100);
      const cacheInfo = cachedCount > 0 ? ` (${cachedCount} cached)` : '';
      const message = `Fetching ${completed}/${total} repos${cacheInfo} (${percent}%)`;
      this.console.write(`\r${message}`);
    };

    updateProgress();

    const processRepo = async (repoPath: string): Promise<void> => {
      try {
        await this.git.fetch(repoPath);
        // Update cache on successful fetch
        this.cache.markFetched(repoPath);
      } catch (err: any) {
        failed++;
        // Do NOT update cache on failure - will retry next time
      } finally {
        completed++;
        updateProgress();
      }
    };

    // Process repos with controlled concurrency
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < reposToFetch.length) {
        const repoPath = reposToFetch[index++];
        await processRepo(repoPath);
      }
    };

    // Start workers (up to concurrency limit)
    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, reposToFetch.length) },
      () => worker()
    );
    await Promise.all(workers);

    if (!silent) {
      // Clear the progress line and show summary
      this.console.write('\r');
      const cacheInfo = cachedCount > 0 ? ` (${cachedCount} cached)` : '';
      if (failed > 0) {
        this.console.log(`Fetched ${total - failed}/${total} repos${cacheInfo} ${chalk.yellow(`(${failed} failed)`)}`);
      } else {
        this.console.log(`Fetched ${total} repos${cacheInfo} ${chalk.green('✓')}`);
      }
    }
  }
}
