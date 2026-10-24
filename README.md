# worktree-flow

> Multi-repo feature development with git worktrees

[![npm version](https://img.shields.io/npm/v/worktree-flow)](https://www.npmjs.com/package/worktree-flow)
[![npm downloads](https://img.shields.io/npm/dm/worktree-flow)](https://www.npmjs.com/package/worktree-flow)
[![Build](https://github.com/simonpratt/worktree-flow/actions/workflows/build.yml/badge.svg)](https://github.com/simonpratt/worktree-flow/actions/workflows/build.yml)
[![license](https://img.shields.io/npm/l/worktree-flow)](https://github.com/simonpratt/worktree-flow/blob/master/LICENSE)

Stop juggling branches across repos. `flow` creates isolated workspaces with git worktrees from multiple repositories, all on the same branch, with a single command.

```
~/repos/                              ~/workspaces/TICKET-123/
├── api-1/     (main)                 ├── api-1/     (TICKET-123 branch)
├── api-2/     (main)       flow      ├── client/    (TICKET-123 branch)
├── client/    (main)     -------->   └── *.md       (copied from ~/repos)
└── AGENTS.md
```

## Quick Start

```bash
npm install -g worktree-flow

# Guided setup wizard
flow quickstart

# Create a workspace with new branches
flow create TICKET-123
# → Select repos interactively, creates branches + worktrees

# Or checkout an existing branch
flow checkout TICKET-123
# → Auto-detects which repos have the branch
```

## Why worktree-flow?

Working on features that span multiple repositories means manually creating branches, switching between repos, and keeping everything in sync. Git worktrees solve part of this, but managing them across a poly-repo is still tedious.

`flow` automates the entire workflow:

- **One command** to create branches across repos with interactive selection
- **Workspace isolation** so each feature gets its own directory with worktrees
- **Workspace-level operations** to push, pull, and check status across all repos at once
- **Safe cleanup** that checks for uncommitted changes and unpushed commits before removing
- **Post-checkout hooks** to run setup commands (like `npm ci`) in parallel after branching

## Commands

### `flow create <name>`

Create a new branch across selected repos. Interactively select which repos to include (type to filter, Tab to toggle), then creates branches and worktrees in a new workspace directory. Every interactive prompt has a matching flag so the command can run fully non-interactively:

- `--repo <name>` (repeatable) — repos to include, skips the interactive picker
- `-f, --from <branch>` — branch to create from, skips the source-branch prompt
- `--post-checkout` / `--no-post-checkout` — run or skip the post-checkout command without prompting

e.g. `flow create TICKET-123 --repo api --repo web --from master --post-checkout`.

### `flow checkout <name>`

Checkout an existing branch. Fetches all repos, detects which have the branch, and creates worktrees.

### `flow attach [name]`

Attach repos to an existing workspace. Discovers available repos not yet in the workspace, presents an interactive picker, creates worktrees with new branches, copies config files, and runs post-checkout commands. Auto-detects the workspace from the current directory, or specify a branch name explicitly. Supports the same `--repo <name>` (repeatable), `-f, --from <branch>`, and `--post-checkout` / `--no-post-checkout` flags as `flow create` to skip the interactive prompts.

### `flow rename <old-name> <new-name>` (or `flow rename <new-name>` from inside a workspace)

Rename a workspace to a new branch name. Renames the workspace directory in a single filesystem move (so any shell already inside it, e.g. a tmux or herdr pane, keeps working at the new location instead of being left in a deleted one), then for each repo: repairs the worktree's git admin data to match its new path (`git worktree repair`), branches from the head of the current branch, and switches the worktree onto the new branch. Also renames the workspace's session if one exists. If a repo fails (e.g. its source repo is missing), the workspace directory has still moved — that repo's worktree simply stays on its previous branch, and the command exits non-zero. Pass `--git-only` to rename the branches (and session) but leave the workspace folder where it is.

### `flow pull`

Pull latest changes for all repos in the current workspace. Run from anywhere inside a workspace.

### `flow push`

Push all repos in the current workspace. Automatically sets upstream on first push.

### `flow status [name]`

Check the status of all repos in a workspace. Shows uncommitted changes, commits ahead of main, and up-to-date repos.

### `flow list` (alias: `ls`)

List all workspaces with their repo count, marking the active workspace (based on current directory) with `*`. This is a fast, offline listing.

Pass `--status` to fetch all repos and show each repo's status: `clean`, `uncommitted`, `ahead`, or `mixed`. The status check uses git's patch-id comparison, which correctly handles squash-merged branches.

### `flow drop <name>`

Drop a workspace and all its worktrees. Fetches latest, checks for uncommitted changes, and prompts for confirmation before removing. Committed changes are safe to drop since they're preserved in git history.

The workspace is moved into `.flow-trash/` in your workspaces folder and deleted in the background, so dropping is instant even with large `node_modules`. Anything left in `.flow-trash/` is a delete that failed, and is safe to remove by hand.

### `flow prune`

Remove workspaces interactively. Displays full workspace status (identical to `flow list --status`), then excludes any workspaces with uncommitted changes or errors from the selection prompt. Resolve issues before pruning those workspaces.

### `flow fetch [name]`

Fetch repos for a specific workspace (when branch name provided), or fetch all repos used across all workspaces (when no branch given). Always bypasses the fetch cache.

### `flow sessions`

Pick workspaces that don't have a session yet and open one for each, using the configured `session-manager` (see [Sessions](#sessions-tmux--herdr)). Pass `--all` to open them all without prompting. Replaces the deprecated `flow tmux sync`.

### `flow config set <key> <value>`

Configure flow settings. See [Configuration](#configuration) below.

## Configuration

Settings are stored in `~/.config/flow/config.json`.

| Key | Description | Default |
|-----|-------------|---------|
| `source-path` | Directory containing your source repos | *required* |
| `dest-path` | Directory where workspaces are created | *required* |
| `session-manager` | `tmux` or `herdr` to open a session per workspace (see [Sessions](#sessions-tmux--herdr)), or `none` | `none` |
| `copy-files` | Comma-separated files to copy from source repos to worktrees (nested paths like `apps/web/.env` work) | `.env` |
| `post-checkout` | Command to run after checkout (e.g. `npm ci`) | *none* |
| `per-repo-post-checkout` | Per-repo commands (see below) | `{}` |

### Per-repo post-checkout commands

Configure different commands for specific repos by editing `~/.config/flow/config.json`:

```json
{
  "post-checkout": "npm ci",
  "per-repo-post-checkout": {
    "api-service": "npm ci && npm run build",
    "frontend": "yarn install"
  }
}
```

Repos with per-repo commands use those; others fall back to the global `post-checkout` command.

With a session manager, post-checkout commands run in each worktree's pane instead of executing directly, so you see the output live.

### Sessions (tmux / herdr)

With `session-manager` set, `create`, `checkout` and `attach` open a session for the workspace, named after its branch. `drop`/`prune` close it and `rename` renames it.

- **tmux**: one window with a pane at the workspace root plus one per worktree, tiled.
- **herdr**: a workspace with a `root` tab split in half at the workspace root, and a `repos` tab with a pane per worktree in a grid. A herdr server is started in the background if none is running; respects `HERDR_SESSION`.

If the session can't be opened, post-checkout runs directly instead. The old `tmux: true` setting is still read as `session-manager: tmux`.

### Repo-level configuration

Individual repos can define a `flow-config.json` at their root to override global settings:

```json
{
  "copy-files": ".env,.env.local",
  "post-checkout": "yarn install"
}
```

Both fields are optional. Precedence (highest to lowest):

- **post-checkout**: repo's `flow-config.json` > global `post-checkout`
- **copy-files**: repo's `flow-config.json` > global `copy-files`

After creating worktrees, flow prints the `copy-files` setting and warns if it doesn't include `.env`.

## Markdown files (AGENTS.md etc.)

All `.md` files at the root of your source-path (e.g. `AGENTS.md`, `CLAUDE.md`) are copied into each workspace (subdirectories are not scanned). This is useful for providing AI coding agents with context about your multi-repo setup. When copying `AGENTS.md`, any line mentioning a repo not included in the workspace is removed.

## License

MIT
