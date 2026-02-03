# worktree-flow

Manage git worktrees across a poly-repo environment.

## What is worktree-flow?

`flow` helps you work on multi-repo features by creating isolated workspace directories with git worktrees. Instead of switching branches across multiple repositories manually, flow creates a workspace folder containing worktrees for all relevant repos on the same branch.

**Before:**
```
~/repos/
├── AGENTS.md
├── my-api-1/          (main branch)
├── my-api-2/          (main branch)
└── my-client/         (main branch)
```

**After running `flow branch TICKET-123`:**
```
~/workspaces/TICKET-123/
├── AGENTS.md          (copied from ~/repos)
├── my-api-1/          (TICKET-123 branch - new worktree)
└── my-client/         (TICKET-123 branch - new worktree)
```

## Installation

```bash
npm install -g worktree-flow
```

Or install locally:

```bash
npm install worktree-flow
npm link
```

## Configuration

Set the paths where your repos live and where workspaces should be created:

```bash
flow config set source-path ~/repos
flow config set dest-path ~/workspaces
```

Optional configuration:

```bash
# Set the main branch name (default: master)
flow config set main-branch main

# Enable tmux session creation (default: false)
flow config set tmux true

# Set config files to copy to worktrees (default: .env)
flow config set config-files .env,.env.local
```

Configuration is stored in `~/.config/flow/config.json`.

## Usage

### Create a new branch across repos

Interactively select which repos to branch:

```bash
flow branch TICKET-123
```

Use spacebar to select repos, enter to confirm. Creates new branches and worktrees.

### Checkout an existing branch

Automatically detects which repos have the branch:

```bash
flow checkout TICKET-123
```

Fetches all repos and creates worktrees for repos that have the branch.

### Pull changes in a workspace

From anywhere inside a workspace directory:

```bash
cd ~/workspaces/TICKET-123
flow pull
```

Pulls latest changes for all repos in the workspace.

### Push changes in a workspace

From anywhere inside a workspace directory:

```bash
cd ~/workspaces/TICKET-123/my-api-1
flow push
```

Pushes all repos in the workspace. Automatically sets upstream on first push.

### Check workspace status

Check the status of all repos in a workspace:

```bash
flow status TICKET-123
```

Fetches latest changes from remote, then shows which repos have:
- Uncommitted changes
- Commits ahead of the main branch
- Are up to date

This helps you quickly see what needs attention before removing a workspace.

### Remove a workspace

Remove a workspace and all its worktrees:

```bash
flow remove TICKET-123
```

This command will:
1. Fetch latest changes from remote
2. Check all worktrees for uncommitted changes and changes ahead of main (diff against configured main branch)
3. Abort if any uncommitted changes or commits ahead of main are found
4. Show what will be removed and ask for confirmation (y/n)
5. Remove all worktrees from their source repos
6. Delete the workspace folder
7. Kill the tmux session (if tmux is enabled)

The "ahead of main" check compares your branch against the configured main branch (default: `master`) to detect actual code differences, so it's safe to remove branches even after they've been squash-merged and the remote branch deleted.

Use this to clean up when you're done with a branch.

## AGENTS.md

If an `AGENTS.md` file exists at the root of your source-path, it will be copied to each workspace root.

## License

MIT
