import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { discoverRepos, getRepoName } from '../lib/repos.js';
import { createWorkspaceDir, copyAgentsMd } from '../lib/workspace.js';

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const repos = discoverRepos(sourcePath);

      if (repos.length === 0) {
        console.error(`No git repositories found in ${sourcePath}`);
        process.exit(1);
      }

      // Fetch all repos and check for branch (8 concurrent at a time)
      const matchingRepos: string[] = [];
      const CONCURRENCY = 8;

      const processRepo = async (repoPath: string): Promise<string | null> => {
        const repoName = getRepoName(repoPath);
        try {
          await git.fetch(repoPath);
          if (await git.remoteBranchExists(repoPath, branchName)) {
            console.log(`${repoName}... ${chalk.green('found')}`);
            return repoPath;
          } else {
            console.log(`${repoName}... ${chalk.dim('no branch')}`);
            return null;
          }
        } catch (err: any) {
          console.log(`${repoName}... ${chalk.red(`error: ${err.stderr || err.message}`)}`);
          return null;
        }
      };

      // Process repos with constant concurrency of 8
      let index = 0;
      const results: Promise<string | null>[] = [];

      const worker = async (): Promise<void> => {
        while (index < repos.length) {
          const repoPath = repos[index++];
          const result = await processRepo(repoPath);
          if (result) matchingRepos.push(result);
        }
      };

      // Start up to 8 workers
      const workers = Array.from({ length: Math.min(CONCURRENCY, repos.length) }, () => worker());
      await Promise.all(workers);

      if (matchingRepos.length === 0) {
        console.error(`\nBranch "${branchName}" not found in any repo.`);
        process.exit(1);
      }

      console.log(
        `\nFound "${branchName}" in ${matchingRepos.length} repo(s). Creating worktrees...`
      );

      const workspacePath = createWorkspaceDir(destPath, branchName);
      let successCount = 0;

      for (const repoPath of matchingRepos) {
        const repoName = getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, repoName);
        try {
          git.addWorktree(repoPath, worktreeDest, branchName);
          console.log(chalk.green(`  ${repoName}`));
          successCount++;
        } catch (err: any) {
          console.error(chalk.red(`  ${repoName}: ${err.stderr || err.message}`));
        }
      }

      copyAgentsMd(sourcePath, workspacePath);
      console.log(
        `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${matchingRepos.length} repos.`
      );
    });
}
