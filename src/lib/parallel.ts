import chalk from 'chalk';

export async function processInParallel<T>(
  items: T[],
  getName: (item: T) => string,
  processor: (item: T, name: string) => Promise<string>
): Promise<number> {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const name = getName(item);
      try {
        const message = await processor(item, name);
        console.log(chalk.green(`  ${name}: ${message}`));
        return { success: true };
      } catch (err: any) {
        const errorMsg = err.stderr || err.message || 'unknown error';
        console.error(chalk.red(`  ${name}: ${errorMsg}`));
        return { success: false };
      }
    })
  );

  return results.filter(
    (r) => r.status === 'fulfilled' && r.value.success
  ).length;
}
