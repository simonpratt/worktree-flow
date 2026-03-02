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
Commands (Adapter Layer) - `src/cli.ts` entry point
  ↓
Use Cases (Application Layer)
  ↓
Services (Domain Layer)
  ↓
Adapters (Ports)
```

## Key Patterns

- Parallel operations use `processInParallel()` for consistent UX with spinners
