import { Command } from 'commander';
import { createServices } from '../lib/services.js';
import type { Services } from '../lib/services.js';
import { ZSH_COMPLETION } from '../lib/completion.js';

const SCRIPTS: Record<string, string> = { zsh: ZSH_COMPLETION };

export function runCompletion(shell: string, services: Services): void {
  const script = SCRIPTS[shell];
  if (!script) {
    throw new Error(`Unsupported shell: ${shell}. Supported: ${Object.keys(SCRIPTS).join(', ')}`);
  }
  services.console.write(script);
}

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion <shell>')
    .helpGroup('Extras')
    .description('Print the shell completion script (zsh)')
    .action((shell: string) => {
      const services = createServices();

      try {
        runCompletion(shell, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
