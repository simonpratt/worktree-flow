# Flowtree CLI — Detailed Implementation Plan

## Overview

Build a CLI tool called `flowtree` that manages git worktrees across a poly-repo environment. It takes multiple git repos living under a single source directory and creates grouped worktree workspaces per ticket/feature branch, enabling developers to work on cross-repo features in isolation.

## Current State Analysis

This is a greenfield project. The repo contains only `requirement.md` and `plan.md`. No code exists yet.

## Desired End State

A working npm-distributable CLI with 5 commands:

| Command | Purpose |
|---------|---------|
| `flowtree config set <key> <value>` | Persist `source-path` and `dest-path` to config |
| `flowtree branch <name>` | Interactive repo picker, then create branches + worktrees |
| `flowtree checkout <name>` | Auto-detect repos with branch, create worktrees |
| `flowtree pull` | Pull all repos in current workspace |
| `flowtree push` | Push all repos in current workspace |

**Verification**: After implementation, running `npm run build && npm link` should make `flowtree` available globally. The full flow (config, branch, pull, push, checkout) should work against real git repos.

## What We're NOT Doing

- No `flowtree delete` or `flowtree clean` commands (worktree removal)
- No `flowtree list` command (listing workspaces)
- No `flowtree status` command (showing status across repos)
- No parallel git operations (sequential is fine for the number of repos expected)
- No git library — we shell out to `git` via `execFileSync`
- No unit tests in this initial implementation (manual verification only)

## Implementation Approach

4 phases, each building on the last. The library layer has zero knowledge of `commander` — commands import from `lib/`. Every git operation goes through `execFileSync` with argument arrays (no shell injection, handles spaces in paths).

---

## Phase 1: Project Scaffolding

### Overview
Set up the TypeScript project with build tooling and dependencies so we can compile and run from the start.

### Changes Required:

#### 1. package.json
**File**: `package.json`

```json
{
  "name": "flowtree",
  "version": "0.1.0",
  "description": "Manage git worktrees across a poly-repo environment",
  "type": "module",
  "bin": {
    "flowtree": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["git", "worktree", "monorepo", "polyrepo", "cli"],
  "license": "MIT"
}
```

#### 2. tsconfig.json
**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false
  },
  "include": ["src"]
}
```

#### 3. .gitignore
**File**: `.gitignore`

```
node_modules/
dist/
```

#### 4. Minimal src/cli.ts (placeholder so build works)
**File**: `src/cli.ts`

```typescript
#!/usr/bin/env node
console.log('flowtree');
```

The shebang is placed directly in the source file. Node.js treats it as a comment. `tsc` preserves it in the output.

#### 5. Install dependencies
```bash
npm install commander @inquirer/checkbox chalk
npm install -D typescript @types/node
```

### Success Criteria:

#### Automated Verification:
- [x] `npm run build` produces `dist/cli.js` with shebang on first line
- [x] `node dist/cli.js` prints "flowtree"

#### Manual Verification:
- [ ] `npm link && flowtree` prints "flowtree"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Library Layer

### Overview
Build the 4 library modules that all commands depend on: config management, git CLI wrappers, repo discovery, and workspace utilities.

### Changes Required:

#### 1. Config management
**File**: `src/lib/config.ts`

```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface FlowtreeConfig {
  'source-path'?: string;
  'dest-path'?: string;
}

const VALID_KEYS: (keyof FlowtreeConfig)[] = ['source-path', 'dest-path'];

export function isValidKey(key: string): key is keyof FlowtreeConfig {
  return VALID_KEYS.includes(key as keyof FlowtreeConfig);
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.config', 'flowtree', 'config.json');
}

export function loadConfig(): FlowtreeConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

export function saveConfig(config: FlowtreeConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function getRequiredConfig(): { sourcePath: string; destPath: string } {
  const config = loadConfig();
  if (!config['source-path'] || !config['dest-path']) {
    console.error(
      'flowtree is not configured. Run:\n' +
      '  flowtree config set source-path <path>\n' +
      '  flowtree config set dest-path <path>'
    );
    process.exit(1);
  }
  return {
    sourcePath: config['source-path'],
    destPath: config['dest-path'],
  };
}
```

#### 2. Git CLI wrappers
**File**: `src/lib/git.ts`

Uses `execFileSync` with argument arrays — no shell injection, handles spaces in paths.

```typescript
import { execFileSync } from 'node:child_process';

function exec(repoPath: string, args: string[]): string {
  const result = execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

export function fetch(repoPath: string): void {
  exec(repoPath, ['fetch', '--all', '--prune']);
}

export function remoteBranchExists(repoPath: string, branch: string): boolean {
  const output = exec(repoPath, ['ls-remote', '--heads', 'origin', branch]);
  return output.length > 0;
}

export function addWorktreeNewBranch(
  repoPath: string,
  worktreePath: string,
  branch: string
): void {
  exec(repoPath, ['worktree', 'add', '-b', branch, worktreePath]);
}

export function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): void {
  exec(repoPath, ['worktree', 'add', worktreePath, branch]);
}

export function pull(worktreePath: string): void {
  exec(worktreePath, ['pull']);
}

export function push(worktreePath: string): void {
  exec(worktreePath, ['push']);
}

export function pushSetUpstream(worktreePath: string, branch: string): void {
  exec(worktreePath, ['push', '--set-upstream', 'origin', branch]);
}

export function getCurrentBranch(worktreePath: string): string {
  return exec(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
}
```

#### 3. Repo discovery
**File**: `src/lib/repos.ts`

```typescript
import fs from 'node:fs';
import path from 'node:path';

export function discoverRepos(sourcePath: string): string[] {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(sourcePath, entry.name))
    .filter(dirPath => fs.existsSync(path.join(dirPath, '.git')))
    .sort();
}

export function getRepoName(repoPath: string): string {
  return path.basename(repoPath);
}
```

#### 4. Workspace utilities
**File**: `src/lib/workspace.ts`

```typescript
import fs from 'node:fs';
import path from 'node:path';

export function createWorkspaceDir(destPath: string, branch: string): string {
  const workspacePath = path.join(destPath, branch);
  if (fs.existsSync(workspacePath)) {
    console.error(`Workspace already exists: ${workspacePath}`);
    process.exit(1);
  }
  fs.mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

export function copyAgentsMd(sourcePath: string, workspacePath: string): void {
  const agentsPath = path.join(sourcePath, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    fs.copyFileSync(agentsPath, path.join(workspacePath, 'AGENTS.md'));
  }
}

export function detectWorkspace(cwd: string, destPath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const normalizedDest = path.resolve(destPath);

  if (
    !normalizedCwd.startsWith(normalizedDest + path.sep) &&
    normalizedCwd !== normalizedDest
  ) {
    return null;
  }

  const relative = path.relative(normalizedDest, normalizedCwd);
  const segments = relative.split(path.sep);

  if (segments.length === 0 || segments[0] === '') {
    return null;
  }

  const workspacePath = path.join(normalizedDest, segments[0]);
  if (!fs.existsSync(workspacePath)) {
    return null;
  }

  return workspacePath;
}

export function getWorktreeDirs(workspacePath: string): string[] {
  const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(workspacePath, entry.name));
}
```

### Success Criteria:

#### Automated Verification:
- [x] `npm run build` succeeds with all 4 lib files
- [x] `node dist/cli.js` still runs

#### Manual Verification:
- [ ] N/A — library code is exercised through commands in Phase 3

**Implementation Note**: After completing this phase and automated verification passes, proceed directly to Phase 3 (no manual testing needed for the library layer in isolation).

---

## Phase 3: Commands

### Overview
Implement all 5 commands. Each command file exports a `register*Command(program)` function that attaches itself to the commander program.

### Changes Required:

#### 1. Config command
**File**: `src/commands/config.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { isValidKey, loadConfig, saveConfig } from '../lib/config.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage flowtree configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (source-path, dest-path)')
    .action((key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: ${key}\nValid keys: source-path, dest-path`
        );
        process.exit(1);
      }

      const resolved = path.resolve(value);
      const config = loadConfig();
      config[key] = resolved;
      saveConfig(config);
      console.log(chalk.green(`Set ${key} = ${resolved}`));
    });
}
```

#### 2. Branch command (interactive picker)
**File**: `src/commands/branch.ts`

```typescript
import { Command } from 'commander';
import checkbox from '@inquirer/checkbox';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { discoverRepos, getRepoName } from '../lib/repos.js';
import { createWorkspaceDir, copyAgentsMd } from '../lib/workspace.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <branch-name>')
    .description('Create branches and worktrees for selected repos')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const repos = discoverRepos(sourcePath);

      if (repos.length === 0) {
        console.error(`No git repositories found in ${sourcePath}`);
        process.exit(1);
      }

      const selected = await checkbox({
        message: `Select repos for branch "${branchName}":`,
        choices: repos.map(repoPath => ({
          name: getRepoName(repoPath),
          value: repoPath,
        })),
      });

      if (selected.length === 0) {
        console.log('No repos selected.');
        return;
      }

      const workspacePath = createWorkspaceDir(destPath, branchName);
      let successCount = 0;

      for (const repoPath of selected) {
        const repoName = getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, repoName);
        try {
          git.addWorktreeNewBranch(repoPath, worktreeDest, branchName);
          console.log(chalk.green(`  ${repoName}`));
          successCount++;
        } catch (err: any) {
          console.error(chalk.red(`  ${repoName}: ${err.stderr || err.message}`));
        }
      }

      copyAgentsMd(sourcePath, workspacePath);
      console.log(
        `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${selected.length} repos.`
      );
    });
}
```

#### 3. Checkout command (automatic)
**File**: `src/commands/checkout.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { discoverRepos, getRepoName } from '../lib/repos.js';
import { createWorkspaceDir, copyAgentsMd } from '../lib/workspace.js';

export function registerCheckoutCommand(program: Command): void {
  program
    .command('checkout <branch-name>')
    .description('Checkout an existing branch across repos')
    .action(async (branchName: string) => {
      const { sourcePath, destPath } = getRequiredConfig();
      const repos = discoverRepos(sourcePath);

      if (repos.length === 0) {
        console.error(`No git repositories found in ${sourcePath}`);
        process.exit(1);
      }

      // Fetch all repos and check for branch
      const matchingRepos: string[] = [];

      for (const repoPath of repos) {
        const repoName = getRepoName(repoPath);
        process.stdout.write(`Fetching ${repoName}...`);
        try {
          git.fetch(repoPath);
          if (git.remoteBranchExists(repoPath, branchName)) {
            matchingRepos.push(repoPath);
            console.log(chalk.green(' found'));
          } else {
            console.log(chalk.dim(' no branch'));
          }
        } catch (err: any) {
          console.log(chalk.red(` error: ${err.stderr || err.message}`));
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
      let successCount = 0;

      for (const repoPath of matchingRepos) {
        const repoName = getRepoName(repoPath);
        const worktreeDest = path.join(workspacePath, repoName);
        try {
          git.addWorktree(repoPath, worktreeDest, branchName);
          console.log(chalk.green(`  ${repoName}`));
          successCount++;
        } catch (err: any) {
          console.error(chalk.red(`  ${repoName}: ${err.stderr || err.message}`));
        }
      }

      copyAgentsMd(sourcePath, workspacePath);
      console.log(
        `\nCreated workspace at ${chalk.cyan(workspacePath)} with ${successCount}/${matchingRepos.length} repos.`
      );
    });
}
```

#### 4. Pull command
**File**: `src/commands/pull.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { detectWorkspace, getWorktreeDirs } from '../lib/workspace.js';

export function registerPullCommand(program: Command): void {
  program
    .command('pull')
    .description('Pull all repos in the current workspace')
    .action(() => {
      const { destPath } = getRequiredConfig();
      const workspacePath = detectWorkspace(process.cwd(), destPath);

      if (!workspacePath) {
        console.error(
          `Not inside a flowtree workspace.\nNavigate to a directory under ${destPath}/.`
        );
        process.exit(1);
      }

      const dirs = getWorktreeDirs(workspacePath);

      if (dirs.length === 0) {
        console.error('No repos found in workspace.');
        process.exit(1);
      }

      console.log(`Pulling ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);
      let successCount = 0;

      for (const dir of dirs) {
        const repoName = path.basename(dir);
        try {
          git.pull(dir);
          console.log(chalk.green(`  ${repoName}: pulled`));
          successCount++;
        } catch (err: any) {
          console.error(chalk.red(`  ${repoName}: ${err.stderr || err.message}`));
        }
      }

      console.log(`\n${successCount}/${dirs.length} repos pulled successfully.`);
    });
}
```

#### 5. Push command
**File**: `src/commands/push.ts`

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { getRequiredConfig } from '../lib/config.js';
import * as git from '../lib/git.js';
import { detectWorkspace, getWorktreeDirs } from '../lib/workspace.js';

export function registerPushCommand(program: Command): void {
  program
    .command('push')
    .description('Push all repos in the current workspace')
    .action(() => {
      const { destPath } = getRequiredConfig();
      const workspacePath = detectWorkspace(process.cwd(), destPath);

      if (!workspacePath) {
        console.error(
          `Not inside a flowtree workspace.\nNavigate to a directory under ${destPath}/.`
        );
        process.exit(1);
      }

      const dirs = getWorktreeDirs(workspacePath);

      if (dirs.length === 0) {
        console.error('No repos found in workspace.');
        process.exit(1);
      }

      console.log(`Pushing ${dirs.length} repo(s) in ${chalk.cyan(workspacePath)}...\n`);
      let successCount = 0;

      for (const dir of dirs) {
        const repoName = path.basename(dir);
        try {
          git.push(dir);
          console.log(chalk.green(`  ${repoName}: pushed`));
          successCount++;
        } catch (err: any) {
          // Retry with --set-upstream if no upstream configured
          const stderr = err.stderr || err.message || '';
          if (stderr.includes('no upstream') || stderr.includes('has no upstream')) {
            try {
              const branch = git.getCurrentBranch(dir);
              git.pushSetUpstream(dir, branch);
              console.log(chalk.green(`  ${repoName}: pushed (set upstream)`));
              successCount++;
            } catch (retryErr: any) {
              console.error(
                chalk.red(`  ${repoName}: ${retryErr.stderr || retryErr.message}`)
              );
            }
          } else {
            console.error(chalk.red(`  ${repoName}: ${stderr}`));
          }
        }
      }

      console.log(`\n${successCount}/${dirs.length} repos pushed successfully.`);
    });
}
```

### Success Criteria:

#### Automated Verification:
- [x] `npm run build` succeeds with all command files
- [x] No type errors

#### Manual Verification:
- [ ] N/A — commands wired in Phase 4, tested end-to-end there

**Implementation Note**: After completing this phase and automated verification passes, proceed directly to Phase 4.

---

## Phase 4: Entry Point & Wiring

### Overview
Wire all commands into the commander program in `src/cli.ts`, build, link, and verify end-to-end.

### Changes Required:

#### 1. CLI entry point
**File**: `src/cli.ts` (replace placeholder)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerBranchCommand } from './commands/branch.js';
import { registerCheckoutCommand } from './commands/checkout.js';
import { registerPullCommand } from './commands/pull.js';
import { registerPushCommand } from './commands/push.js';

const program = new Command();

program
  .name('flowtree')
  .description('Manage git worktrees across a poly-repo environment')
  .version('0.1.0');

registerConfigCommand(program);
registerBranchCommand(program);
registerCheckoutCommand(program);
registerPullCommand(program);
registerPushCommand(program);

program.parse();
```

### Success Criteria:

#### Automated Verification:
- [x] `npm run build` produces `dist/cli.js` with shebang on first line
- [x] `node dist/cli.js --help` shows all 5 commands
- [x] `node dist/cli.js config set source-path /tmp/test-source` writes config to `~/.config/flowtree/config.json`

#### Manual Verification:
- [ ] `npm link` makes `flowtree` available globally
- [ ] `flowtree --help` shows: config, branch, checkout, pull, push
- [ ] `flowtree config set source-path <real-repos-dir>` persists config
- [ ] `flowtree config set dest-path /tmp/flowtree-workspaces` persists config
- [ ] `flowtree branch test-123` shows interactive picker with repos from source-path
- [ ] Selecting repos with spacebar and confirming with enter creates worktrees at `/tmp/flowtree-workspaces/test-123/<repo-name>/`
- [ ] Each worktree is a working git checkout on branch `test-123`
- [ ] AGENTS.md is copied to workspace root if it exists at source-path root
- [ ] `cd /tmp/flowtree-workspaces/test-123 && flowtree pull` pulls all repos
- [ ] `flowtree push` pushes all repos (or sets upstream on first push)
- [ ] `flowtree checkout test-123` (from a different machine/clean state) fetches repos and creates worktrees for repos that have the branch

**Implementation Note**: This is the final phase. After all automated checks pass, perform full manual verification of the end-to-end flow.

---

## Key Design Decisions

### tsc instead of a bundler
We use `tsc` directly — no tsup, tsdown, or esbuild. The project is small (10 files), doesn't need bundling, and `tsc` outputs individual `.js` files that map 1:1 to source. The shebang (`#!/usr/bin/env node`) is placed directly in `src/cli.ts` and preserved by `tsc` in the output.

### Git operations use `execFileSync` with argument arrays
```typescript
execFileSync('git', ['-C', repoPath, 'worktree', 'add', '-b', branch, dest]);
```
Not string interpolation with `execSync`. This prevents shell injection and handles spaces in paths.

### Workspace detection walks the path
`detectWorkspace(cwd, destPath)` checks if `cwd` is under `destPath`, then extracts the first path segment as the workspace name. This means `flowtree pull` works from the workspace root, from inside a repo subdir, or from any nested depth.

### `git worktree add -b` for branch, `git worktree add` for checkout
The `branch` command creates new branches, so it uses `-b` to create the branch and worktree atomically. The `checkout` command uses existing remote branches, so no `-b`.

### Push retries with `--set-upstream`
On first push of a new branch, `git push` fails because there's no upstream. The push command catches this specific error and retries with `--set-upstream origin <branch>`.

## References

- Original requirement: `requirement.md`
- High-level plan: `plan.md`
