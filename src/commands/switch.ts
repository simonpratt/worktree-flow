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
import type { WorkspaceServer } from '../usecases/listWorkspaceServers.js';
import type { SessionManager } from '../lib/sessionManager.js';

/** How to reach a session from outside its session manager. */
const OUTSIDE_HINTS: Record<string, (name: string) => string> = {
  tmux: (name) => `Run this from inside tmux, or attach with: tmux attach -t '${name}'`,
  herdr: () => 'Run this from inside herdr.',
};

const formatPorts = (server: WorkspaceServer) => server.ports.map((port) => `:${port}`).join(' ');

/**
 * Picks a server running in a workspace or source repo, as aligned columns of
 * name, ports, command and the pane it runs in.
 * @example label → 'feature/a  :3000 :9229  node  feature/a › repos'
 */
async function pickServer(
  useCases: UseCases,
  services: Services,
  sessions: SessionManager,
  pickOne: (opts: PickOneOptions) => Promise<string>
): Promise<WorkspaceServer> {
  const { sourcePath, destPath } = services.config.getRequired();
  const servers = await useCases.listWorkspaceServers.execute({ sourcePath, destPath, sessions });
  if (servers.length === 0) {
    throw new Error('No servers are running in your workspaces or source repos.');
  }

  // Padded before colouring, since escape codes would throw the widths off
  const width = (column: (server: WorkspaceServer) => string) => Math.max(...servers.map((s) => column(s).length));
  const nameWidth = width((s) => s.name);
  const portsWidth = width(formatPorts);
  const commandWidth = width((s) => s.command);

  const pid = await pickOne({
    message: 'Switch to server:',
    options: servers.map((server) => ({
      value: String(server.pid),
      label: [
        chalk.cyan(server.name.padEnd(nameWidth)),
        chalk.yellow(formatPorts(server).padEnd(portsWidth)),
        server.command.padEnd(commandWidth),
        chalk.dim(server.pane?.location ?? 'no pane'),
      ].join('  '),
    })),
  });
  return servers.find((server) => String(server.pid) === pid)!;
}

export async function runSwitch(
  name: string | undefined,
  useCases: UseCases,
  services: Services,
  deps: { pickOne: (opts: PickOneOptions) => Promise<string> },
  options: { servers?: boolean } = {}
): Promise<void> {
  if (name && options.servers) {
    throw new Error('Pass a workspace name or --servers, not both.');
  }

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

  if (options.servers) {
    const server = await pickServer(useCases, services, sessions, deps.pickOne);
    if (server.pane && sessions.focusPane) {
      await sessions.focusPane(server.pane);
      return;
    }
    if (!server.workspacePath) {
      const reason = sessions.listRunningPanes ? `isn't running in a ${sessions.label} pane` : 'has no session to switch to';
      services.console.log(`${server.command} (${formatPorts(server)}) runs in the source repo ${server.name}, but ${reason}.`);
      return;
    }
    workspace = { workspacePath: server.workspacePath, displayName: server.name };
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
    .option('--servers', 'Pick from the servers running in your workspaces and source repos instead')
    .action(async (name: string | undefined, options: { servers?: boolean }) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runSwitch(name, useCases, services, { pickOne }, options);
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });
}
