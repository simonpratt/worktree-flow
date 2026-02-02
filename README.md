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

## AGENTS.md

If an `AGENTS.md` file exists at the root of your source-path, it will be copied to each workspace root.

## License

MIT
