# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`worktree-flow` (CLI command: `flow`) is a TypeScript CLI tool for managing git worktrees across multiple repositories (poly-repo). It creates isolated workspace directories containing worktrees from multiple repos on the same branch, enabling multi-repo feature development.

## Making Changes

We're following a TDD Flow. When making changes
1. Investigate the test files and modify/add coverage for the new behaviour.
2. Make the changes
3. Ensure type-check passes via `npm run type-check`
4. Ensure the tests pass via the `npm run test:coverage` command.
5. Update the README.md, if relevant. We want to keep this short and concise while covering key behaviour.

Tests are split into three categories:
- Files in `lib/` are tested via unit tests in the `lib/__test__` folder. Use the memfs helpers where possible if testing the file system.
- Files in `usecases/` are tested via unit tests in the `usecases/__test__` folder. Mock all services with sinon stubs.
- Files in `commands/` are tested via integration tests in the `commands/__integration` folder. Minimise stubbing.

For all testing focus on behaviour, not shallow validation of output.

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

The codebase follows **Hexagonal Architecture** (Ports & Adapters) with a **Use Case Layer**:

```
Commands (Adapter Layer)
  ↓
Use Cases (Application Layer)
  ↓
Services (Domain Layer)
  ↓
Adapters (Ports)
```

**Entry Point**: `src/cli.ts` - Registers all Commander.js commands

**Commands** (`src/commands/`):
- Thin layer handling CLI concerns (user prompts, console output, error handling)
- Use `createUseCases()` to get use case instances
- Catch errors and handle process.exit at command level
- Never put business logic in commands - delegate to use cases

**Use Cases** (`src/usecases/`):
- `CreateBranchWorkspaceUseCase` - Orchestrate workspace creation with new branches
- `CheckoutWorkspaceUseCase` - Orchestrate workspace creation for existing branches
- `RemoveWorkspaceUseCase` - Orchestrate workspace removal with validation
- `PushWorkspaceUseCase` - Push all worktrees in a workspace
- `PullWorkspaceUseCase` - Pull all worktrees in a workspace
- `CheckWorkspaceStatusUseCase` - Check status of all worktrees
- `usecases.ts` - Factory function that wires use cases with services

**Services** (`src/lib/`):
- `ConfigService` - Manages `~/.config/flow/config.json` with Zod schemas
- `WorkspaceDirectoryService` - Workspace directory operations (create, detect, list, remove)
- `WorktreeService` - Worktree creation and config file copying
- `PostCheckoutService` - Execute post-checkout commands in worktrees
- `RepoService` - Repository discovery and filtering from source-path
- `GitService` - Git worktree operations (add, remove, branch detection)
- `FetchService` - Parallel git fetch across repos
- `ParallelService` - Parallel command execution with visual progress
- `TmuxService` - Optional tmux session management
- `StatusService` - Git status checking (uncommitted changes, ahead of main)
- `services.ts` - Factory function that wires services with adapters
- `errors.ts` - Custom error classes (ConfigNotSetError, WorkspaceNotFoundError, etc.)
- `workspaceResolver.ts` - Utility for resolving workspace from branch name or cwd

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
