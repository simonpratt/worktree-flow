import chalk from 'chalk';
import type { IConsole } from '../adapters/types.js';
import type { GitService } from './git.js';

const FETCH_CONCURRENCY = 8;

/**
 * FetchService handles parallel fetching of multiple repos.
 */
export class FetchService {
  constructor(
    private git: GitService,
    private console: IConsole
  ) {}

  async fetchRepos(repoPaths: string[], options?: { silent?: boolean }): Promise<void> {
    if (repoPaths.length === 0) {
      return;
    }

    const silent = options?.silent ?? false;
    const total = repoPaths.length;
    let completed = 0;
    let failed = 0;

    const updateProgress = () => {
      if (silent) return;
      const percent = Math.floor((completed / total) * 100);
      const message = `Fetching repos... ${completed}/${total} (${percent}%)`;
      this.console.write(`\r${message}`);
    };

    updateProgress();

    const processRepo = async (repoPath: string): Promise<void> => {
      try {
        await this.git.fetch(repoPath);
      } catch (err: any) {
        failed++;
      } finally {
        completed++;
        updateProgress();
      }
    };

    // Process repos with controlled concurrency
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < repoPaths.length) {
        const repoPath = repoPaths[index++];
        await processRepo(repoPath);
      }
    };

    // Start workers (up to concurrency limit)
    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, repoPaths.length) },
      () => worker()
    );
    await Promise.all(workers);

    if (!silent) {
      // Clear the progress line and show summary
      this.console.write('\r');
      if (failed > 0) {
        this.console.log(`Fetched ${total - failed}/${total} repos ${chalk.yellow(`(${failed} failed)`)}`);
      } else {
        this.console.log(`Fetched ${total} repos ${chalk.green('✓')}`);
      }
    }
  }
}
