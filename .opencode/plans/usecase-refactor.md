# Refactoring Plan: Use Case Restructuring

## Goal

Replace four existing use cases (`runPostCheckout`, `createBranchWorkspace`, `checkoutWorkspace`, `addReposToWorkspace`) with four new use cases that have clear separation of responsibilities:

| New Use Case | Responsibility |
|---|---|
| `createWorkspace` | Creates workspace folder, initial config file, AGENTS.md copy, initial tmux session (root pane only) |
| `createBranch` | Creates a git branch in a single repo (no worktree/workspace concerns) |
| `addToWorkspace` | Processes one repo: creates worktree (existing branch checkout), copies files, runs post-checkout, adds tmux pane |
| `discoverReposWithBranch` | Discovers all repos in source-path and checks which ones have a given branch |

## Key Design Decisions

- **`createBranch` is single-repo**: The caller loops/parallelises over repos.
- **`addToWorkspace` always checks out an existing branch**: Callers must call `createBranch` first if they need a new branch.
- **`RunPostCheckoutUseCase` is absorbed into `addToWorkspace`**: Post-checkout logic lives directly in `addToWorkspace`, executing per-repo.
- **Parallel execution lives in the command layer**: Commands use `Promise.allSettled` (or similar) to call `addToWorkspace` for multiple repos concurrently.
- **Tmux**: `createWorkspace` creates the session with a root pane. `addToWorkspace` adds a pane per repo via a new `TmuxService.addPane()` method, and sends post-checkout keys to that pane when tmux is enabled.
- **`discoverReposWithBranch`**: Extracts repo discovery + branch checking from the old `checkoutWorkspace` into its own use case.

---

## Phase 1: Add `TmuxService.addPane()` method

**Files changed:**
- `src/lib/tmux.ts`
- `src/lib/__test__/tmux.test.ts` (if exists, otherwise new test coverage)

**Changes:**
1. [x] Add `addPane(sessionName: string, worktreePath: string): Promise<number>` to `TmuxService`
   - Runs `tmux split-window -t <sessionName> -c <worktreePath>`
   - Runs `tmux select-layout -t <sessionName> tiled`
   - Returns the pane index (could query via `tmux display-message -p -t <sessionName> '#{pane_index}'` after split, or track incrementally)
2. [x] Add tests for the new method

**Why first:** This is a prerequisite for `addToWorkspace` to add tmux panes. It's a small, isolated change to a service.

---

## Phase 2: Create `CreateWorkspaceUseCase`

**Files created:**
- [x] `src/usecases/createWorkspace.ts`
- [x] `src/usecases/__test__/createWorkspace.test.ts`

**Responsibilities:**
1. [x] Create workspace directory via `WorkspaceDirectoryService.createWorkspaceDir(destPath, branchName)`
2. [x] Save placeholder config via `WorkspaceConfigService.savePlaceholder(workspacePath)`
3. [x] Copy AGENTS.md from source-path via `WorkspaceDirectoryService.copyAgentsMd(sourcePath, workspacePath)`
4. [x] If tmux enabled: create tmux session with root pane only via `TmuxService.createSession(workspacePath, branchName, [])` (empty worktree array = root pane only)

**Params:**
```typescript
type CreateWorkspaceParams = {
  branchName: string;
  sourcePath: string;
  destPath: string;
  tmux: boolean;
};

type CreateWorkspaceResult = {
  workspacePath: string;
  tmuxCreated: boolean;
};
```

**Dependencies:** `WorkspaceDirectoryService`, `WorkspaceConfigService`, `TmuxService`

**Tests (unit, sinon stubs):**
- [x] Creates workspace directory and saves placeholder config
- [x] Copies AGENTS.md when it exists
- [x] Creates tmux session when tmux is enabled
- [x] Handles tmux creation failure gracefully (returns `tmuxCreated: false`)
- [x] Does not create tmux session when tmux is disabled

---

## Phase 3: Create `CreateBranchUseCase` + `GitService.createBranch()`

**Files changed:**
- [x] `src/lib/git.ts` — add `createBranch()` method

**Files created:**
- [x] `src/usecases/createBranch.ts`
- [x] `src/usecases/__test__/createBranch.test.ts`

### GitService changes

Add method: `createBranch(repoPath: string, branchName: string, startPoint: string): Promise<void>`
- Runs `git -C <repoPath> branch --no-track <branchName> <startPoint>`

### CreateBranch use case responsibilities
1. Check if `sourceBranch` exists as a remote-tracking branch via `GitService.localRemoteBranchExists(repoPath, sourceBranch)`
2. If not, fall back to first existing branch from `['master', 'main', 'trunk', 'develop']` via `GitService.findFirstExistingBranch()`
3. Create the branch: `GitService.createBranch(repoPath, branchName, 'origin/<actualBaseBranch>')`
4. Return the actual base branch used (so the caller can track it for workspace config)

**Params:**
```typescript
type CreateBranchParams = {
  repoPath: string;
  branchName: string;
  sourceBranch: string;
};

type CreateBranchResult = {
  repoName: string;
  baseBranch: string; // the actual base branch used (after fallback)
};
```

**Dependencies:** `GitService`

**Tests (unit, sinon stubs):**
- Creates branch from specified source branch when it exists
- Falls back to default branches when source branch doesn't exist
- Returns the actual base branch used
- Throws when no fallback branch exists either

---

## Phase 4: Create `AddToWorkspaceUseCase`

**Files created:**
- [x] `src/usecases/addToWorkspace.ts`
- [x] `src/usecases/__test__/addToWorkspace.test.ts`

**Responsibilities (for a single repo):**
1. Create worktree: `WorktreeService.createWorktreeCheckout(repoPath, worktreeDest, branchName)` — always checks out an existing branch
2. Resolve and copy config files: load `RepoConfigService` for repo-level overrides, then `WorktreeService.copyConfigFilesToWorktree()`
3. Save base branch to workspace config: `WorkspaceConfigService.save(workspacePath, { baseBranches: { [repoName]: baseBranch } })`
4. Add tmux pane (if session name provided): `TmuxService.addPane(sessionName, worktreeDest)` — returns pane index
5. Run post-checkout command (if configured):
   - Resolve command via `RepoConfigService.resolvePostCheckout()` (3-level precedence)
   - If tmux enabled (session name provided + pane index available): `TmuxService.sendKeysToPane(sessionName, paneIndex, command)`
   - If tmux disabled: `PostCheckoutService.runCommandInDirectory(worktreeDest, command)`

**Params:**
```typescript
type AddToWorkspaceParams = {
  repoPath: string;
  workspacePath: string;
  branchName: string;
  baseBranch: string;
  sessionName?: string;   // tmux session name (present if tmux is enabled)
  copyFiles?: string;
  postCheckout?: string; // Single command, consumer should use perRepoPostChecked || postCheckout
};

type AddToWorkspaceResult = {
  repoName: string;
  worktreePath: string;
  postCheckoutRan: boolean;
  postCheckoutSuccess: boolean;
  tmuxPaneAdded: boolean;
};
```

**Dependencies:** `WorktreeService`, `WorkspaceConfigService`, `RepoConfigService`, `PostCheckoutService`, `TmuxService`

**Tests (unit, sinon stubs):**
- Creates worktree by checking out existing branch
- Copies config files with repo-level overrides
- Copies config files with global fallback when no repo config
- Saves base branch to workspace config
- Adds tmux pane when session name provided
- Runs post-checkout command via PostCheckoutService when tmux disabled
- Sends post-checkout command to tmux pane when tmux enabled
- Handles post-checkout failure gracefully (returns `postCheckoutSuccess: false`)
- Skips post-checkout when no command configured

---

## Phase 5: Create `DiscoverReposWithBranchUseCase`

**Files created:**
- [x] `src/usecases/discoverReposWithBranch.ts`
- [x] `src/usecases/__test__/discoverReposWithBranch.test.ts`

**Responsibilities:**
1. [x] Discover all repos via `RepoService.discoverRepos(sourcePath)`
2. [x] Throw `NoReposFoundError` if none found
3. [x] Check which repos have the branch via `RepoService.findReposWithBranch(allRepos, branchName)`
4. [x] Return all repos, matching repos, and branch check results

**Params:**
```typescript
type DiscoverReposWithBranchParams = {
  sourcePath: string;
  branchName: string;
};

type DiscoverReposWithBranchResult = {
  allRepos: string[];
  matchingRepos: string[];
  branchCheckResults: RepoBranchCheckResult[];
};
```

**Dependencies:** `RepoService`

**Tests (unit, sinon stubs):**
- Discovers repos and returns matching ones
- Returns empty matching when no repos have the branch
- Throws NoReposFoundError when source path has no repos
- Returns branch check results with error info

---

## Phase 6: Update command layer + integration tests

### 6a: Update `branch` command (`src/commands/branch.ts`)

**Current flow:** User selects repos → `createBranchWorkspace.execute()` does everything

**New flow:**
1. User selects repos, source branch, confirms post-checkout
2. Fetch selected repos
3. Call `createWorkspace.execute()` — creates workspace dir, placeholder config, AGENTS.md, tmux session
4. For each selected repo, in parallel (via `Promise.allSettled`):
   a. Call `createBranch.execute()` — creates branch in source repo, returns baseBranch
   b. Call `addToWorkspace.execute()` — creates worktree, copies files, adds tmux pane, runs post-checkout
5. Track fetch cache usage
6. Display results (success counts, tmux info, post-checkout counts)

### 6b: Update `checkout` command (`src/commands/checkout.ts`)

**Current flow:** `checkoutWorkspace.execute()` does everything

**New flow:**
1. Fetch all repos
2. Call `discoverReposWithBranch.execute()` — find repos with the branch
3. Display per-repo branch check results
4. Throw error if no repos match
5. Call `createWorkspace.execute()` — creates workspace dir, placeholder config, AGENTS.md, tmux session
6. For each matching repo, in parallel:
   a. Detect base branch via `GitService.findFirstExistingBranch()`
   b. Call `addToWorkspace.execute()` — creates worktree (existing branch), copies files, adds tmux pane, runs post-checkout
7. Display results

**Note:** For checkout, `createBranch` is NOT called since branches already exist. The base branch detection (for workspace config) happens in the command layer per-repo and is passed to `addToWorkspace`.

### 6c: Update `add` command (`src/commands/add.ts`)

**Current flow:** `addReposToWorkspace.execute()` creates worktrees + post-checkout

**New flow:**
1. Resolve workspace, discover repos, filter existing, user picks repos/source branch
2. Fetch selected repos
3. For each selected repo, in parallel:
   a. Call `createBranch.execute()` — creates branch
   b. Call `addToWorkspace.execute()` — creates worktree, copies files, adds tmux pane, runs post-checkout
4. Track fetch cache usage
5. Display results

**Note:** The `add` command does NOT call `createWorkspace` since the workspace already exists. If tmux is enabled, pass the existing session name (workspace branch name) to `addToWorkspace` so it can add panes.

### 6d: Update integration tests

All three integration test files need updating to match the new command flows:
- `src/commands/__integration__/branch.integration.test.ts`
- `src/commands/__integration__/checkout.integration.test.ts`
- `src/commands/__integration__/add.integration.test.ts`

The test assertions should remain the same (they test end-to-end behaviour). The only changes needed are if internal wiring changes the `UseCases` type signature, requiring updates to `createIntegrationServices` and `createUseCases`.

---

## Phase 7: Update `usecases.ts` factory and clean up

**Changes to `src/usecases/usecases.ts`:**
1. Remove imports/instantiation: `RunPostCheckoutUseCase`, `AddReposToWorkspaceUseCase`, `CreateBranchWorkspaceUseCase`, `CheckoutWorkspaceUseCase`
2. Add imports/instantiation: `CreateWorkspaceUseCase`, `CreateBranchUseCase`, `AddToWorkspaceUseCase`, `DiscoverReposWithBranchUseCase`
3. Wire new use cases with their service dependencies

**Files deleted:**
- `src/usecases/runPostCheckout.ts`
- `src/usecases/createBranchWorkspace.ts`
- `src/usecases/checkoutWorkspace.ts`
- `src/usecases/addReposToWorkspace.ts`
- `src/usecases/__test__/runPostCheckout.test.ts`
- `src/usecases/__test__/addReposToWorkspace.test.ts`

**Note:** `resumeTmuxSessions.ts` uses `TmuxService.createSession()` with all worktree dirs. This continues to work unchanged — it's a separate flow for resuming sessions after reboot.

---

## Phase 8: Verify

1. `npm run type-check` — ensure no type errors
2. `npm run test:coverage` — ensure all tests pass
3. Review README.md for any relevant updates (unlikely since this is internal refactoring)

---

## Execution Order Summary

| Phase | Description | Depends on |
|-------|-------------|------------|
| 1 | Add `TmuxService.addPane()` | — |
| 2 | Create `CreateWorkspaceUseCase` | — |
| 3 | Create `CreateBranchUseCase` + `GitService.createBranch()` | — |
| 4 | Create `AddToWorkspaceUseCase` | Phase 1 |
| 5 | Create `DiscoverReposWithBranchUseCase` | — |
| 6 | Update commands + integration tests | Phases 2-5 |
| 7 | Update factory, delete old files | Phase 6 |
| 8 | Type-check + test | Phase 7 |

Phases 1-3 and 5 can be done in parallel. Phase 4 depends on Phase 1 (for `addPane`). Phase 6 depends on all new use cases. Phase 7 is cleanup. Phase 8 is verification.

---

## Risk Notes

- **Tmux pane indexing:** The current `RunPostCheckoutUseCase` uses worktree order (index + 1) for pane indices. With `addPane` adding panes one-at-a-time, the pane index should be returned by `addPane` and used for `sendKeysToPane`. This is cleaner than the current positional approach.
- **Parallel safety of workspace config saves:** Multiple `addToWorkspace` calls running in parallel will each call `WorkspaceConfigService.save()`. Since `save()` does read-merge-write, there's a race condition. **Mitigation:** Either make the `baseBranch` save sequential (batch after all parallel adds complete, in the command layer), or add file locking to `WorkspaceConfigService`.
- **Git branch creation race conditions:** Multiple `createBranch` calls to the same repo would conflict (branch already exists). This shouldn't happen in practice since each repo only appears once, but worth noting.
