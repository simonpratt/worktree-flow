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

      // Fetch all repos and check for branch
      const matchingRepos: string[] = [];

      for (const repoPath of repos) {
        const repoName = getRepoName(repoPath);
        process.stdout.write(`Fetching ${repoName}...`);
        try {
          git.fetch(repoPath);
          if (git.remoteBranchExists(repoPath, branchName)) {
            matchingRepos.push(repoPath);
            console.log(chalk.green(' found'));
          } else {
            console.log(chalk.dim(' no branch'));
          }
        } catch (err: any) {
          console.log(chalk.red(` error: ${err.stderr || err.message}`));
        }
      }

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
