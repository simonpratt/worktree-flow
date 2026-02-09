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
├── client/    (main)     -------->   └── AGENTS.md  (copied from ~/repos)
└── AGENTS.md
```

## Quick Start

```bash
npm install -g worktree-flow

# Point flow at your repos and workspace directory
flow config set source-path ~/repos
flow config set dest-path ~/workspaces

# Create a workspace with new branches
flow branch TICKET-123
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

### `flow branch <name>`

Create a new branch across selected repos. Interactively select which repos to include, then creates branches and worktrees in a new workspace directory.

### `flow checkout <name>`

Checkout an existing branch. Fetches all repos, detects which have the branch, and creates worktrees.

### `flow pull`

Pull latest changes for all repos in the current workspace. Run from anywhere inside a workspace.

### `flow push`

Push all repos in the current workspace. Automatically sets upstream on first push.

### `flow status [name]`

Check the status of all repos in a workspace. Shows uncommitted changes, commits ahead of main, and up-to-date repos.

### `flow list` (alias: `ls`)

List all workspaces with status indicators. Shows:
- Active workspace (marked with `*`) based on current directory
- Overall status: `clean`, `uncommitted`, `ahead`, `behind`, `diverged`, or `mixed`
- Repo count for each workspace

Fetches all repos before checking status to ensure accurate information.

### `flow remove <name>`

Remove a workspace and all its worktrees. Fetches latest, checks for uncommitted changes and unpushed commits, and prompts for confirmation before removing.

### `flow prune` (alias: `clean`)

Remove stale workspaces in bulk. Finds workspaces where all worktrees are clean, fully merged, and haven't been committed to in over 7 days.

### `flow tmux resume`

Create tmux sessions for all workspaces that don't already have one. Each session is created with split panes (one for the workspace root and one for each worktree) using a tiled layout. Skips workspaces that already have active sessions.

Requires `tmux` to be installed and the `tmux` config option to be enabled.

### `flow config set <key> <value>`

Configure flow settings. See [Configuration](#configuration) below.

## Configuration

Settings are stored in `~/.config/flow/config.json`.

| Key | Description | Default |
|-----|-------------|---------|
| `source-path` | Directory containing your source repos | *required* |
| `dest-path` | Directory where workspaces are created | *required* |
| `main-branch` | Main branch name | `master` |
| `tmux` | Create tmux sessions with split panes (root + each worktree) | `false` |
| `copy-files` | Files to copy from source repos to worktrees | `.env` |
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

## AGENTS.md

If an `AGENTS.md` file exists at the root of your source-path, it will be copied into each workspace. This is useful for providing AI coding agents with context about your multi-repo setup.

## License

MIT
