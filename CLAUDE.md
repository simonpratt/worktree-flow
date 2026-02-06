# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`worktree-flow` (CLI command: `flow`) is a TypeScript CLI tool for managing git worktrees across multiple repositories (poly-repo). It creates isolated workspace directories containing worktrees from multiple repos on the same branch, enabling multi-repo feature development.

## Build & Development

```bash
# Build TypeScript to dist/
npm run build

# Install globally for local testing
npm link

# Test the CLI
flow --help
```

## Architecture

**Entry Point**: `src/cli.ts` - Registers all Commander.js commands

**Commands** (`src/commands/`):
- Each file exports a `register*Command(program)` function
- Commands handle user interaction (inquirer prompts) and orchestrate lib functions
- Never put business logic in commands - delegate to lib/

**Core Libraries** (`src/lib/`):
- `config.ts` - Manages `~/.config/flow/config.json` with Zod schemas. Uses kebab-case keys in storage ("source-path"), camelCase in code (sourcePath)
- `workspace.ts` - Workspace directory operations, post-checkout command execution
- `repos.ts` - Repository discovery and filtering from source-path
- `git.ts` - Git worktree operations (add, remove, branch detection)
- `fetch.ts` - Parallel git fetch across repos
- `parallel.ts` - Parallel command execution with visual progress
- `tmux.ts` - Optional tmux session management
- `status.ts` - Git status checking (uncommitted changes, ahead of main)

**Config Flow**:
1. Raw config stored as JSON with kebab-case keys
2. `loadRawConfig()` reads and validates with `RawConfigSchema`
3. `loadConfig()` transforms to camelCase with `ParsedConfigSchema` and applies defaults
4. `getRequiredConfig()` ensures source-path and dest-path are set

**Workspace Structure**:
```
~/workspaces/BRANCH-NAME/
├── AGENTS.md          (copied from source-path if exists)
├── repo-1/            (worktree)
└── repo-2/            (worktree)
```

## Key Patterns

- All git operations use `child_process.exec` wrapped in promisify
- Parallel operations use `processInParallel()` for consistent UX with spinners
- Config files (.env by default) are copied from source repos to worktrees after creation
- Post-checkout commands run in parallel across worktrees with user confirmation
- "Ahead of main" detection uses `git diff main...branch` to handle squash-merged branches
