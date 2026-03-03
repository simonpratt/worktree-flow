import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import input from '@inquirer/input';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { NodeShell } from '../adapters/node.js';
import type { IShell } from '../adapters/types.js';

const DIVIDER = chalk.dim('  ─────────────────────────────────────────────────');
const DEFAULT_DEST_PATH = '~/dev/workspaces';
const MAX_NAMES_SHOWN = 3;

function expandTilde(p: string): string {
  return p.replace(/^~/, os.homedir());
}

function summariseNames(names: string[], noun: string): string {
  const count = names.length;
  if (count === 0) return `no ${noun}s found`;
  const shown = names.slice(0, MAX_NAMES_SHOWN).join(', ');
  if (count <= MAX_NAMES_SHOWN) return `${count} ${count === 1 ? noun : noun + 's'}: ${shown}`;
  return `${count} ${noun}s including ${shown}`;
}

async function isTmuxInstalled(shell: IShell): Promise<boolean> {
  try {
    await shell.execFile('which', ['tmux']);
    return true;
  } catch {
    return false;
  }
}

export async function runQuickstart(
  services: Services,
  deps: {
    input: (opts: any) => Promise<string>;
    shell: IShell;
  }
): Promise<void> {
  const existing = services.config.loadRaw();

  services.console.log('');
  services.console.log(chalk.bold('  Welcome to flow!'));
  services.console.log('');
  services.console.log('  flow creates isolated workspaces with git worktrees across multiple');
  services.console.log('  repos — work on a feature branch in all your repos at once.');
  services.console.log('');
  services.console.log(DIVIDER);
  services.console.log(chalk.bold('  Required'));
  services.console.log(DIVIDER);
  services.console.log('');

  // Loop until user provides a source path that contains git repositories
  services.console.log(chalk.dim('  Source directory containing your repos (e.g. ~/dev)'));
  let sourcePath!: string;
  while (true) {
    const sourcePathRaw = await deps.input({
      message: 'Where are your git repositories?',
      default: existing['source-path'] ?? '',
      prefill: 'editable',
    });

    const resolved = path.resolve(expandTilde(sourcePathRaw));

    try {
      const repos = services.repos.discoverRepos(resolved);
      if (repos.length === 0) {
        services.console.log(chalk.yellow('  ⚠ No git repositories found — please try a different path \n'));
        continue;
      }
      const names = repos.map(r => path.basename(r));
      services.console.log(chalk.dim(`  Found ${summariseNames(names, 'repository')}`));
      sourcePath = resolved;
      break;
    } catch (err: any) {
      const msg = err.code === 'ENOENT'
        ? '  ⚠ Directory not found — please try again \n'
        : '  ⚠ Could not read directory — please try again \n';
      services.console.log(chalk.yellow(msg));
    }
  }

  services.console.log('');
  services.console.log(chalk.dim('  Each branch gets its own folder here — should be an empty directory (e.g. ~/dev/workspaces)'));
  const destPathRaw = await deps.input({
    message: 'Where should workspaces be created?',
    default: existing['dest-path'] ?? DEFAULT_DEST_PATH,
    prefill: 'editable',
  });

  const destPath = path.resolve(expandTilde(destPathRaw));

  const workspaces = services.workspaceDir.listWorkspaces(destPath);
  if (workspaces.length > 0) {
    const names = workspaces.map(w => w.name);
    services.console.log(chalk.dim(`  Found ${summariseNames(names, 'workspace')}`));
  }

  services.console.log('');
  services.console.log(DIVIDER);
  services.console.log(chalk.bold('  Optional') + chalk.dim('  (press Enter to skip)'));
  services.console.log(DIVIDER);
  services.console.log('');

  services.console.log(chalk.dim('  Runs in each worktree after a workspace is created'));
  const postCheckout = await deps.input({
    message: 'Post-checkout command?',
    default: existing['post-checkout'] ?? '',
    prefill: 'editable',
  });

  let tmuxEnabled = existing['tmux'] === 'true';
  const tmuxAvailable = await isTmuxInstalled(deps.shell);

  if (tmuxAvailable) {
    services.console.log('');
    services.console.log(chalk.dim('  Opens a tmux session with split panes, one per worktree'));
    const tmuxRaw = await deps.input({
      message: 'Enable tmux integration (yes/no)?',
      default: existing['tmux'] === 'true' ? 'yes' : 'no',
      prefill: 'editable',
    });
    tmuxEnabled = /^(y|yes)$/i.test(tmuxRaw.trim());
  }

  // All-or-nothing save — only reached if all prompts complete without throwing
  const newConfig = {
    ...existing,
    'source-path': sourcePath,
    'dest-path': destPath,
    'tmux': tmuxEnabled ? 'true' as const : 'false' as const,
  };

  if (postCheckout) {
    newConfig['post-checkout'] = postCheckout;
  } else {
    delete newConfig['post-checkout'];
  }

  services.config.saveRaw(newConfig);

  // Summary
  services.console.log('');
  services.console.log(DIVIDER);
  services.console.log('');
  services.console.log(chalk.green('  ✓ Configuration saved!'));
  services.console.log('');
  services.console.log(`    ${chalk.cyan('source-path')}    ${sourcePath}`);
  services.console.log(`    ${chalk.cyan('dest-path')}      ${destPath}`);
  if (postCheckout) {
    services.console.log(`    ${chalk.cyan('post-checkout')}  ${postCheckout}`);
  }
  services.console.log(`    ${chalk.cyan('tmux')}           ${tmuxEnabled}`);
  services.console.log('');
  services.console.log(chalk.bold('  Get started:'));
  services.console.log('');
  services.console.log(`    ${chalk.cyan('flow create my-feature')}     Create a new branch across repos`);
  services.console.log(`    ${chalk.cyan('flow checkout my-feature')}   Checkout an existing branch`);
  services.console.log(`    ${chalk.cyan('flow list')}                  See all your workspaces`);
  services.console.log('');
  services.console.log(chalk.dim('  Run `flow config list` to see all settings.'));
  services.console.log('');
}

export function registerQuickstartCommand(program: Command): void {
  program
    .command('quickstart')
    .helpGroup('Getting Started')
    .description('Interactive setup wizard for first-time configuration')
    .action(async () => {
      const services = createServices();

      try {
        await runQuickstart(services, { input, shell: new NodeShell() });
      } catch (error: any) {
        // Suppress ExitPromptError — user Ctrl-C'd a prompt, exit silently
        if (error?.name === 'ExitPromptError') {
          return;
        }
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
