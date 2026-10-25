import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { RepoGroupNotFoundError } from '../lib/errors.js';
import { handleCommandError, resolveReposByName } from './helpers.js';

// Group names are passed as a single CLI argument to --group
const GROUP_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

type GroupServices = Pick<Services, 'config' | 'repos' | 'console'>;

/**
 * Create or replace a repo group. Every repo must exist in the source-path.
 */
export function runGroupSet(name: string, repoNames: string[], services: GroupServices): void {
  if (!GROUP_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid group name "${name}": use only letters, numbers, ".", "_" and "-".`);
  }

  const { sourcePath } = services.config.getRequired();
  const repoPaths = resolveReposByName(services.repos.discoverRepos(sourcePath), repoNames);
  const members = Array.from(new Set(repoPaths.map((repoPath) => path.basename(repoPath))));

  const groups = services.config.load().repoGroups;
  services.config.set({ 'repo-groups': { ...groups, [name]: members } });

  services.console.log(chalk.green(`Set group ${name}: ${members.join(', ')}`));
}

/**
 * List the repo groups and their members, flagging members no longer in the source-path.
 */
export function runGroupList(services: GroupServices): void {
  const groups = services.config.load().repoGroups;
  const names = Object.keys(groups).sort();

  if (names.length === 0) {
    services.console.log('No repo groups. Create one with: flow group set <name> <repo...>');
    return;
  }

  const { sourcePath } = services.config.getRequired();
  const existing = new Set(services.repos.discoverRepos(sourcePath).map((repoPath) => path.basename(repoPath)));

  services.console.log(chalk.bold('\nRepo groups:'));
  for (const name of names) {
    const members = groups[name].map((repo) => (existing.has(repo) ? repo : `${repo} ${chalk.red('(missing)')}`));
    services.console.log(`  ${chalk.cyan(name)}: ${members.join(', ')}`);
  }
  services.console.log('');
}

/**
 * Remove a repo group.
 */
export function runGroupRemove(name: string, services: GroupServices): void {
  const { [name]: removed, ...rest } = services.config.load().repoGroups;
  if (!removed) {
    throw new RepoGroupNotFoundError(name, Object.keys(rest).sort());
  }

  services.config.set({ 'repo-groups': rest });

  services.console.log(chalk.green(`Removed group ${name}`));
}

export function registerGroupCommand(program: Command): void {
  const groupCmd = program
    .command('group')
    .helpGroup('Getting Started')
    .description('Manage repo groups, used by --group on create and attach');

  groupCmd
    .command('set <name> <repos...>')
    .description('Create or replace a repo group')
    .action((name: string, repos: string[]) => {
      const services = createServices();
      try {
        runGroupSet(name, repos, services);
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });

  groupCmd
    .command('list')
    .alias('ls')
    .description('List repo groups and their repos')
    .action(() => {
      const services = createServices();
      try {
        runGroupList(services);
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });

  groupCmd
    .command('rm <name>')
    .description('Remove a repo group')
    .action((name: string) => {
      const services = createServices();
      try {
        runGroupRemove(name, services);
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });
}
