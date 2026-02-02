# Summary

We're building a CLI to help us manage git worktrees in a poly-repo environment.

# Assumptions

All of the repositories should be in a folder defined within the config. ie.
`/<config-path>/my-api-1`
`/<config-path>/my-api-2`
`/<config-path>/my-api-3`
`/<config-path>/my-client-1`
`/<config-path>/my-client-2`
`/<config-path>/my-client-3`

# Requirements

The sole outcome and requirement of this CLI is to help us take the above poly-repo structure and create git-worktrees for a ticket or feature. For example `flowtree branch TICKET-123` would create this structure, where only the required repositories are branched and created.

`/<dest-path>/TICKET-123/my-api-1`
`/<dest-path>/TICKET-123/my-client-1`

# Commands

`flowtree config set <option>`: Save an option in the config file

`flowtree branch <branch-name>`: Create a new branch via an interactive picker that allows you to select repositories with space. Once you confirm with enter it creates the branch in all of these repositories and creates a worktree for that branch in a folder.

`flowtree checkout <branch-name>`: Checkout an existing branch. Flowtree should fetch all repos in my `<config-path>`, see which repos the branch exists in, and create the worktree for them.

`flowtree pull`: When run inside a workspace we have created it should pull all of the worktrees to fetch the latest versions.

`flowtree push`: When run inside a workspace we have created it should push all of the worktrees.

# Agents.md

If there is an `AGENTS.md` located at the root of the config path, ie `/<config-path>/AGENTS.md`, this agents file should be copied to the root of each workspace we create.

# Distribution

We want to distribute this via npm
