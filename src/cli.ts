#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerBranchCommand } from './commands/branch.js';
import { registerCheckoutCommand } from './commands/checkout.js';
import { registerPullCommand } from './commands/pull.js';
import { registerPushCommand } from './commands/push.js';

const program = new Command();

program
  .name('flow')
  .description('Manage git worktrees across a poly-repo environment')
  .version('0.1.0');

registerConfigCommand(program);
registerBranchCommand(program);
registerCheckoutCommand(program);
registerPullCommand(program);
registerPushCommand(program);

program.parse();
