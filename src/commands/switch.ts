import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { handleCommandError, pickWorkspace } from './helpers.js';
import { pickOne, type PickOneOptions } from './prompts.js';

/** How to reach a session from outside its session manager. */
const OUTSIDE_HINTS: Record<string, (name: string) => string> = {
  tmux: (name) => `Run this from inside tmux, or attach with: tmux attach -t '${name}'`,
  herdr: () => 'Run this from inside herdr.',
};

export async function runSwitch(
  name: string | undefined,
  useCases: UseCases,
  services: Services,
  deps: { pickOne: (opts: PickOneOptions) => Promise<string> }
): Promise<void> {
  const { sessionManager } = services.config.load();
  const sessions = services.sessionManagers.get(sessionManager);

  if (!sessions) {
    throw new Error(
      'No session manager configured. Run:\n' +
      '  flow config set session-manager <tmux|herdr>'
    );
  }

  let workspace = name
    ? resolveWorkspace(name, services.workspaceDir, services.workspaceConfig, services.config, services.process)
    : undefined;

  // Checked before picking, so the picker isn't shown for nothing
  if (!sessions.isInside((key) => services.process.env(key))) {
    throw new Error(
      `Not running inside ${sessions.label}. ${OUTSIDE_HINTS[sessionManager](workspace?.displayName ?? '<name>')}`
    );
  }

  if (!workspace) {
    const workspacePath = await pickWorkspace('Switch to workspace:', services, deps.pickOne);
    workspace = {
      workspacePath,
      displayName: services.workspaceConfig.getBranchName(workspacePath) ?? path.basename(workspacePath),
    };
  }

  const sessionName = workspace.displayName;
  const { created } = await useCases.switchToWorkspace.execute({
    sessions,
    workspacePath: workspace.workspacePath,
    sessionName,
  });

  if (created) {
    services.console.log(`Created ${sessions.label} session: ${chalk.cyan(sessionName)}`);
  }
}

export function registerSwitchCommand(program: Command): void {
  program
    .command('switch [name]')
    .helpGroup('Workspaces')
    .description('Switch to a workspace\'s tmux/herdr session, creating it if needed (pick one if no name is given)')
    .action(async (name: string | undefined) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runSwitch(name, useCases, services, { pickOne });
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });
}
