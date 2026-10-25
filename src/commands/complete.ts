import { Command } from 'commander';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { complete, formatCandidate } from '../lib/completion.js';

/**
 * Prints the shell completion candidates for the words typed after `flow`. Reads
 * only local state, and prints nothing on any error so completion fails quietly.
 */
export function runComplete(words: string[], program: Command, services: Services): void {
  try {
    const candidates = complete(words, {
      commands: () =>
        program
          .createHelp()
          .visibleCommands(program)
          .map((command) => ({
            name: command.name(),
            description: command.description(),
            group: command.helpGroup(),
          })),
      workspaces: () => services.workspaceDir.listWorkspaces(services.config.getRequired().destPath),
    });
    for (const candidate of candidates) {
      services.console.log(formatCandidate(candidate));
    }
  } catch {
    // Completion never fails loudly
  }
}

export function registerCompleteCommand(program: Command): void {
  program
    .command('__complete', { hidden: true })
    .argument('[words...]')
    .allowUnknownOption()
    .action((words: string[]) => {
      runComplete(words, program, createServices());
    });
}
