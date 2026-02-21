#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerBranchCommand } from './commands/branch.js';
import { registerCheckoutCommand } from './commands/checkout.js';
import { registerListCommand } from './commands/list.js';
import { registerPullCommand } from './commands/pull.js';
import { registerPushCommand } from './commands/push.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerStatusCommand } from './commands/status.js';
import { registerPruneCommand } from './commands/prune.js';
import { registerFetchCommand } from './commands/fetch.js';
import { registerTmuxCommand } from './commands/tmux.js';
import { registerQuickstartCommand } from './commands/quickstart.js';

const program = new Command();

program
  .name('flow')
  .description('Manage git worktrees across a poly-repo environment')
  .version('0.1.0');

registerConfigCommand(program);
registerBranchCommand(program);
registerCheckoutCommand(program);
registerListCommand(program);
registerPullCommand(program);
registerPushCommand(program);
registerRemoveCommand(program);
registerStatusCommand(program);
registerPruneCommand(program);
registerFetchCommand(program);
registerTmuxCommand(program);
registerQuickstartCommand(program);

program.parse();
