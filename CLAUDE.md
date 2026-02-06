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

The codebase follows **Hexagonal Architecture** (Ports & Adapters) for testability:

**Entry Point**: `src/cli.ts` - Registers all Commander.js commands

**Commands** (`src/commands/`):
- Thin orchestration layer handling CLI concerns (user prompts, error handling)
- Use `createServices()` to get service instances with production adapters
- Catch errors and handle process.exit at command level
- Never put business logic in commands - delegate to services

**Services** (`src/lib/`):
- `ConfigService` - Manages `~/.config/flow/config.json` with Zod schemas
- `WorkspaceService` - Workspace directory operations, post-checkout command execution
- `RepoService` - Repository discovery and filtering from source-path
- `GitService` - Git worktree operations (add, remove, branch detection)
- `FetchService` - Parallel git fetch across repos
- `ParallelService` - Parallel command execution with visual progress
- `TmuxService` - Optional tmux session management
- `StatusService` - Git status checking (uncommitted changes, ahead of main)
- `services.ts` - Factory function that wires services with adapters
- `errors.ts` - Custom error classes (ConfigNotSetError, WorkspaceNotFoundError, etc.)

**Adapters** (`src/adapters/`):
- `types.ts` - Interfaces for I/O operations (IFileSystem, IShell, IConsole, IProcess)
- `node.ts` - Production implementations using Node.js APIs (NodeFileSystem, NodeShell, etc.)

**Config Flow**:
1. Raw config stored as JSON with kebab-case keys
2. `ConfigService.loadRaw()` reads and validates with `RawConfigSchema`
3. `ConfigService.load()` transforms to camelCase with `ParsedConfigSchema` and applies defaults
4. `ConfigService.getRequired()` ensures source-path and dest-path are set (throws ConfigNotSetError if not)

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
