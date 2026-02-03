import chalk from 'chalk';
import * as git from './git.js';
import { getRepoName } from './repos.js';

const FETCH_CONCURRENCY = 8;

/**
 * Fetches multiple repos in parallel with controlled concurrency.
 */
export async function fetchRepos(repoPaths: string[]): Promise<void> {
  if (repoPaths.length === 0) {
    return;
  }

  const total = repoPaths.length;
  let completed = 0;
  let failed = 0;

  const updateProgress = () => {
    const percent = Math.floor((completed / total) * 100);
    const message = `Fetching repos... ${completed}/${total} (${percent}%)`;
    process.stdout.write(`\r${message}`);
  };

  updateProgress();

  const processRepo = async (repoPath: string): Promise<void> => {
    try {
      await git.fetch(repoPath);
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

  // Clear the progress line and show summary
  process.stdout.write('\r');
  if (failed > 0) {
    console.log(`Fetched ${total - failed}/${total} repos ${chalk.yellow(`(${failed} failed)`)}`);
  } else {
    console.log(`Fetched ${total} repos ${chalk.green('✓')}`);
  }
}
