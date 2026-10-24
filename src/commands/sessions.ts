import { Command } from 'commander';
import chalk from 'chalk';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { handleCommandError } from './helpers.js';
import { multiselect, type MultiselectOptions } from './prompts.js';

export async function runSessions(
  useCases: UseCases,
  services: Services,
  deps: { multiselect: (opts: MultiselectOptions) => Promise<string[]> },
  options: { all?: boolean } = {}
): Promise<void> {
  const { destPath } = services.config.getRequired();
  const { sessionManager } = services.config.load();
  const sessions = services.sessionManagers.get(sessionManager);

  if (!sessions) {
    throw new Error(
      'No session manager configured. Run:\n' +
      '  flow config set session-manager <tmux|herdr>'
    );
  }

  const workspaces = await useCases.listWorkspaceSessions.execute({ sessions, destPath });

  if (workspaces.length === 0) {
    services.console.log('No workspaces found.');
    return;
  }

  const withoutSession = workspaces.filter((w) => !w.hasSession);
  if (withoutSession.length === 0) {
    services.console.log(`All ${workspaces.length} workspace(s) already have a ${sessions.label} session.`);
    return;
  }

  let selected = withoutSession;
  if (!options.all) {
    const selectedPaths = await deps.multiselect({
      message: `Open ${sessions.label} sessions for:`,
      options: withoutSession.map((w) => ({ value: w.path, label: w.sessionName })),
    });
    selected = withoutSession.filter((w) => selectedPaths.includes(w.path));
  }

  if (selected.length === 0) {
    services.console.log('No workspaces selected.');
    return;
  }

  const result = await useCases.openSessions.execute({ sessions, workspaces: selected });

  if (result.sessionsCreated > 0) {
    services.console.log(
      chalk.green(`✓ Created ${result.sessionsCreated} ${sessions.label} session${result.sessionsCreated === 1 ? '' : 's'}`)
    );
  }

  if (result.sessionsSkipped > 0) {
    services.console.log(
      chalk.blue(`○ Skipped ${result.sessionsSkipped} existing session${result.sessionsSkipped === 1 ? '' : 's'}`)
    );
  }

  if (result.errors.length > 0) {
    services.console.log(chalk.red('\nErrors:'));
    for (const error of result.errors) {
      services.console.log(chalk.red(`  ${error.workspace}: ${error.error}`));
    }
  }
}

export function registerSessionsCommand(program: Command): void {
  program
    .command('sessions')
    .helpGroup('Extras')
    .description('Open tmux/herdr sessions for workspaces that don\'t have one')
    .option('--all', 'Open sessions for every such workspace without prompting')
    .action(async (options: { all?: boolean }) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runSessions(useCases, services, { multiselect }, options);
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });

  program
    .command('tmux')
    .helpGroup('Deprecated')
    .description(chalk.dim('Deprecated: use "flow sessions" instead'))
    .command('sync')
    .action(async () => {
      const services = createServices();
      const useCases = createUseCases(services);

      services.console.log(chalk.yellow('⚠ "flow tmux sync" is deprecated. Use "flow sessions --all" instead.'));
      try {
        await runSessions(useCases, services, { multiselect }, { all: true });
      } catch (error: any) {
        handleCommandError(error, services);
      }
    });
}
