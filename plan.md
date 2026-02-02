# Flowtree CLI - Implementation Plan

## Overview

A CLI tool to manage git worktrees across a poly-repo environment. Takes repos from a source directory and creates grouped worktree workspaces per ticket/feature branch.

## Tech Stack

- **Language**: TypeScript (ESM, targeting Node 18+)
- **CLI framework**: `commander`
- **Interactive picker**: `@inquirer/checkbox`
- **Terminal colors**: `chalk` (or `picocolors` if ESM friction)
- **Build**: `tsc` (standard TypeScript compiler, shebang in source file)
- **Git**: `execFileSync('git', [...args])` — no git library, safe argument passing

## Project Structure

```
flowtree/
  package.json
  tsconfig.json
  src/
    cli.ts                    # Entry point, commander program
    commands/
      config.ts               # flowtree config set <key> <value>
      branch.ts               # flowtree branch <name> (interactive picker)
      checkout.ts             # flowtree checkout <name> (auto-detect)
      pull.ts                 # flowtree pull (workspace-scoped)
      push.ts                 # flowtree push (workspace-scoped)
    lib/
      config.ts               # Read/write ~/.config/flowtree/config.json
      git.ts                  # Git CLI wrappers via execFileSync
      repos.ts                # Discover git repos in source-path
      workspace.ts            # Create workspace dirs, detect workspace, copy AGENTS.md
```

## Implementation Order

### Phase 1: Scaffolding
1. **package.json** — name `flowtree`, `"bin": { "flowtree": "./dist/cli.js" }`, `"type": "module"`, `"files": ["dist"]`
2. **tsconfig.json** — strict, ES2022 target, module NodeNext, outDir dist
3. Install dependencies: `commander`, `@inquirer/checkbox`, `chalk` (runtime); `typescript`, `@types/node` (dev)

### Phase 2: Library Layer
5. **src/lib/config.ts**
   - `loadConfig()` — read `~/.config/flowtree/config.json`, return `{}` if missing
   - `saveConfig(config)` — write JSON, `mkdirSync` parent recursively
   - `getRequiredConfig()` — load + throw if `source-path` or `dest-path` missing

6. **src/lib/git.ts**
   - Core `exec(repoPath, args[])` using `execFileSync('git', ['-C', repoPath, ...args])`
   - `fetch(repoPath)` — `fetch --all --prune`
   - `remoteBranchExists(repoPath, branch)` — `ls-remote --heads origin <branch>`
   - `addWorktreeNewBranch(repoPath, dest, branch)` — `worktree add -b <branch> <dest>`
   - `addWorktree(repoPath, dest, branch)` — `worktree add <dest> <branch>`
   - `pull(path)`, `push(path)`, `pushSetUpstream(path, branch)`
   - `getCurrentBranch(path)` — `rev-parse --abbrev-ref HEAD`

7. **src/lib/repos.ts**
   - `discoverRepos(sourcePath)` — read dir entries, filter to those with `.git`, return sorted paths
   - `getRepoName(repoPath)` — `path.basename()`

8. **src/lib/workspace.ts**
   - `createWorkspaceDir(destPath, branch)` — mkdir, return path
   - `copyAgentsMd(sourcePath, workspacePath)` — copy if exists, silently skip if not
   - `detectWorkspace(cwd, destPath)` — check if cwd is under destPath, extract first path segment as workspace name
   - `getWorktreeDirs(workspacePath)` — list subdirectories

### Phase 3: Commands
9. **src/commands/config.ts**
   - Validate key is `source-path` or `dest-path`
   - Resolve value to absolute path
   - Load, merge, save config

10. **src/commands/branch.ts**
    - Load config, discover repos
    - Show `@inquirer/checkbox` picker (spacebar select, enter confirm)
    - For each selected repo: `git worktree add -b <branch> <dest>/<branch>/<repo> <branch>`
    - Copy AGENTS.md to workspace root
    - Print summary

11. **src/commands/checkout.ts**
    - Load config, discover repos
    - Fetch all repos (print progress per repo)
    - Check which repos have the branch via `ls-remote`
    - Auto-create worktrees for all matching repos (no picker)
    - Copy AGENTS.md, print summary

12. **src/commands/pull.ts**
    - Load config, detect workspace from cwd
    - For each worktree subdir: `git pull`
    - Continue on failure, print summary

13. **src/commands/push.ts**
    - Same as pull but `git push`
    - On "no upstream" failure, retry with `git push --set-upstream origin <branch>`

### Phase 4: Entry Point
14. **src/cli.ts**
    - Create commander program with name, description, version
    - Register all 5 commands
    - `program.parse()`

## Workspace Detection (for pull/push)

When user runs `flowtree pull` from anywhere inside `<dest-path>/<branch-name>/...`:

1. Check if `cwd` starts with `destPath`
2. Get relative path from `destPath` to `cwd`
3. First segment of relative path = workspace name (branch name)
4. Workspace path = `<destPath>/<firstSegment>/`

This handles all cases: workspace root, repo subdir, deeply nested paths.

## Error Handling

- Missing config: clear message directing user to run `flowtree config set`
- Git failures: print git's stderr, prefixed with repo name
- Batch operations (pull/push): continue on single repo failure, print success/failure summary
- Branch already exists: suggest `flowtree checkout` instead
- Workspace already exists: error before creating anything

## Verification

1. `npm run build` compiles without errors
2. `npm link` makes `flowtree` available globally
3. Test flow:
   - `flowtree config set source-path <path-with-git-repos>`
   - `flowtree config set dest-path /tmp/worktrees`
   - `flowtree branch test-branch` — picker appears, select repos, worktrees created
   - `cd /tmp/worktrees/test-branch && flowtree pull` — pulls all repos
   - `flowtree push` — pushes all repos
   - `flowtree checkout test-branch` — fetches, finds repos, creates worktrees
4. Verify AGENTS.md is copied when present at source-path root
