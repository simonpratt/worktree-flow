import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig, loadConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { discoverRepos, getRepoName } from '../lib/repos.js';
import { createWorkspaceDir, copyAgentsMd, copyConfigFilesToWorktree } from '../lib/workspace.js';
import { createTmuxSession } from '../lib/tmux.js';
import { processInParallel } from '../lib/parallel.js';
import { fetchRepos } from '../lib/fetch.js';

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const config = loadConfig();
      const repos = discoverRepos(sourcePath);

      if (repos.length === 0) {
        console.error(`No git repositories found in ${sourcePath}`);
        process.exit(1);
      }

      // Fetch all repos first
      await fetchRepos(repos);

      // Check which repos have the branch (using local remote-tracking branches after fetch)
      console.log('\nChecking for branch...');
      const matchingRepos: string[] = [];
      for (const repoPath of repos) {
        const repoName = getRepoName(repoPath);
        try {
          if (await git.localRemoteBranchExists(repoPath, branchName)) {
            console.log(`${repoName}... ${chalk.green('found')}`);
            matchingRepos.push(repoPath);
          } else {
            console.log(`${repoName}... ${chalk.dim('no branch')}`);
          }
        } catch (err: any) {
          console.log(`${repoName}... ${chalk.red(`error: ${err.stderr || err.message}`)}`);
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

      const successCount = await processInParallel(
        matchingRepos,
        (repoPath) => getRepoName(repoPath),
        async (repoPath, name) => {
          const worktreeDest = path.join(workspacePath, name);
          await git.addWorktree(repoPath, worktreeDest, branchName);
          copyConfigFilesToWorktree(repoPath, worktreeDest, config.copyFiles);
          return 'created';
        }
      );

      copyAgentsMd(sourcePath, workspacePath);

      // Create tmux session if enabled
      if (config.tmux) {
        try {
          await createTmuxSession(workspacePath, branchName);
          console.log(`Created tmux session: ${chalk.cyan(branchName)}`);
        } catch (error: any) {
          console.error(chalk.yellow(`Warning: Failed to create tmux session: ${error.message}`));
        }
      }

      console.log(
        `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${matchingRepos.length} repos.`
      );
    });
}
