# flowtree

Manage git worktrees across a poly-repo environment.

## What is flowtree?

`flowtree` helps you work on multi-repo features by creating isolated workspace directories with git worktrees. Instead of switching branches across multiple repositories manually, flowtree creates a workspace folder containing worktrees for all relevant repos on the same branch.

```
~/repos/my-api-1       (main branch)
~/repos/my-api-2       (main branch)
~/repos/my-client      (main branch)

↓ flowtree branch TICKET-123

~/workspaces/TICKET-123/my-api-1    (TICKET-123 branch)
~/workspaces/TICKET-123/my-client   (TICKET-123 branch)
```

## Installation

```bash
npm install -g git-flowtree
```

Or install locally:

```bash
npm install git-flowtree
npm link
```

## Configuration

Set the paths where your repos live and where workspaces should be created:

```bash
flowtree config set source-path ~/repos
flowtree config set dest-path ~/workspaces
```

Configuration is stored in `~/.config/flowtree/config.json`.

## Usage

### Create a new branch across repos

Interactively select which repos to branch:

```bash
flowtree branch TICKET-123
```

Use spacebar to select repos, enter to confirm. Creates new branches and worktrees.

### Checkout an existing branch

Automatically detects which repos have the branch:

```bash
flowtree checkout TICKET-123
```

Fetches all repos and creates worktrees for repos that have the branch.

### Pull changes in a workspace

From anywhere inside a workspace directory:

```bash
cd ~/workspaces/TICKET-123
flowtree pull
```

Pulls latest changes for all repos in the workspace.

### Push changes in a workspace

From anywhere inside a workspace directory:

```bash
cd ~/workspaces/TICKET-123/my-api-1
flowtree push
```

Pushes all repos in the workspace. Automatically sets upstream on first push.

## AGENTS.md

If an `AGENTS.md` file exists at the root of your source-path, it will be copied to each workspace root.

## License

MIT
