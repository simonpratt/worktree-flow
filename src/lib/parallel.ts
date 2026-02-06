import chalk from 'chalk';
import type { IConsole } from '../adapters/types.js';

/**
 * ParallelService handles parallel processing with console feedback.
 */
export class ParallelService {
  constructor(private console: IConsole) {}

  async processInParallel<T>(
    items: T[],
    getName: (item: T) => string,
    processor: (item: T, name: string) => Promise<string>
  ): Promise<number> {
    const results = await Promise.allSettled(
      items.map(async (item) => {
        const name = getName(item);
        try {
          const message = await processor(item, name);
          this.console.log(chalk.green(`  ${name}: ${message}`));
          return { success: true };
        } catch (err: any) {
          const errorMsg = err.stderr || err.message || 'unknown error';
          this.console.error(chalk.red(`  ${name}: ${errorMsg}`));
          return { success: false };
        }
      })
    );

    return results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    ).length;
  }
}
