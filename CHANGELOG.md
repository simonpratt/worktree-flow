# Changelog

## [0.0.27] Unreleased

### Added

- herdr support as a session manager alongside tmux. The new `session-manager` config (`none` | `tmux` | `herdr`) replaces `tmux`; a legacy `tmux: true` is still read as `session-manager: tmux`. A herdr session is a workspace labelled with the branch name, with a `root` tab split at the workspace root and a `repos` tab with a pane per worktree. A headless herdr server is started if none is running. Quickstart offers whichever session managers are installed.
- `flow create` and `flow checkout` offer to enable herdr once, when it's installed and no session manager is set. If you decline, it isn't offered again.
- `flow sessions` picks workspaces that have no session and opens one for each (`--all` skips the prompt). It replaces `flow tmux sync`, which remains as a deprecated alias.
- `flow list --status` fetches and shows per-repo status, which `flow list` used to do by default
- `flow rename --git-only` renames the branches (and session) but leaves the workspace folder where it is
- All root-level `.md` files in `source-path` (e.g. `CLAUDE.md`) are now copied into the workspace, not just `AGENTS.md`
- A root-level `Makefile` in `source-path` is now copied into the workspace on `create` and `checkout`
- When `AGENTS.md` is copied, lines mentioning repos not included in the workspace are removed
- `create`, `attach` and `checkout` print the `copy-files` setting and warn if it doesn't include `.env`
- `dest-path` can now sit inside `source-path`, e.g. `~/dev/.workspaces`, and quickstart defaults to it. `dest-path` can't equal `source-path` or contain it, and `flow config set` and quickstart reject that.
- `flow switch [name]` jumps to a workspace's tmux/herdr session from inside tmux or herdr, creating the session if needed. With no name it shows a workspace picker.
- `flow switch --servers` picks from the servers (processes listening on a TCP port, found with `lsof`) running inside your workspaces and source repos, and switches to the one chosen. With herdr, each server is traced to the pane it was started from and its tab is focused, including servers in source repos.
- `flow completion zsh` prints a zsh completion script that completes commands and, for `flow switch`, workspace names
- Repo groups: save sets of repos with `flow group set|list|rm`, then use them via `--group` on `create` and `attach`, or pick one to pre-select in the repo picker

### Changed

- Repo pickers are now searchable: type to filter, Tab to toggle
- `flow list` is now a fast offline listing of workspace names, repo counts and the active marker; status checks moved behind `--status`
- `flow drop` and `flow prune` return almost immediately: the workspace is moved into `.flow-trash/` in the workspaces folder and deleted in the background. Anything left in `.flow-trash/` is a delete that failed and can be removed by hand.
- With a session manager, `create`, `checkout` and `attach` open the session once all worktrees exist. Post-checkout then runs in each worktree's pane, or directly if the session can't be opened.
- Faster startup: the CLI is now published as a single bundle with no runtime dependencies, and the prompt library only loads when a prompt is shown. Quick commands like `flow list` start ~40ms sooner, and `npm install -g` installs one package.
- Requires Node 22 or later

### Removed

- The `branch-auto-select-repos` setting. Use a repo group instead.

### Fixed

- tmux sessions with several worktrees no longer fail with "no space for new pane": the layout is re-tiled after each split and splits run one at a time
- `copy-files` entries with nested paths (e.g. `apps/web/.env`) are now copied when the parent folder isn't tracked by git; they used to be skipped silently. Copy failures are now reported.
- Commands run from inside a workspace whose branch contains special characters (e.g. `feature/ABC-123`) now use the real branch name instead of the sanitized folder name. Previously `flow drop` left the real tmux session running, `flow rename` didn't rename it, and `flow attach` created branches with the sanitized name. The branch name is now stored in the workspace's `flow-config.json`; older workspaces fall back to the previous behaviour.
- `flow prune` now kills the tmux session named after the branch, not the sanitized folder name
- Post-checkout commands now reach the right tmux panes when `base-index` / `pane-base-index` is set to 1
- `flow tmux sync` reports existing sessions as skipped instead of created
- `flow drop` only reports "Killed tmux session" when a session actually existed
- tmux sessions are matched by exact name. Previously, with a `feat-login` session but no `feat` session, `flow create feat` added its panes to `feat-login`, and `drop`/`rename` could act on the wrong session.
- `flow checkout` now removes lines mentioning repos not in the workspace when copying `AGENTS.md`, as `flow create` already did

## [0.0.26] 2026-09-23

### Fixed

- `flow checkout` (and `flow attach`) no longer leave a worktree without upstream tracking when the local branch already existed in the source repo without one (e.g. left over from a prior create/checkout/remove cycle) — `git worktree add` only auto-configures tracking for branches that don't already exist locally, so `git pull` in the new worktree failed with "no tracking information"

## [0.0.25] 2026-09-05

### Added

- `flow rename <old-name> <new-name>` (or `flow rename <new-name>` from inside a workspace) — renames the workspace directory in a single filesystem move (so a shell already inside it, e.g. a tmux pane, keeps working at the new location), repairs each repo's worktree admin data (`git worktree repair`) to match, branches from the head of the current branch, switches the worktree onto the new branch, and renames the tmux session if one exists. If a repo fails (e.g. its source repo is missing), the workspace has still moved — that repo's worktree just stays on its previous branch, and the command exits non-zero.
- `-f, --from <branch>` and `--post-checkout` / `--no-post-checkout` flags for `flow create` and `flow attach` — skip the source-branch and post-checkout prompts, letting both commands run fully non-interactively alongside the existing `--repo <name>` flag

## [0.0.24] 2026-09-03

### Added

- `--repo <name>` flag (repeatable) for `flow create` and `flow attach` — specify repos directly and skip the interactive picker

## [0.0.23] 2026-03-16

### Fixed

- Workspace folder names now sanitize special characters from branch names — characters like `/`, `\`, `:`, `.`, and other non-alphanumeric characters (except `-` and `_`) are replaced with `_` (e.g. `release/123` creates folder `release_123`)

## [0.0.22] 2026-03-16

### Changed

- Tidied up output for `flow checkout` command

## [0.0.21] 2026-03-12

### Added

- `.devcontainer` folder copying — if a `.devcontainer` directory exists in `source-path`, it is recursively copied to the workspace root during `create` and `checkout`

### Changed

- `flow checkout` now fetches and discovers repos first, then shows only repos where the branch was found (repos without the branch are no longer listed), then prompts for post-checkout — previously the post-checkout prompt appeared before any fetching

### Fixed

- Post-checkout commands now run in all tmux panes instead of only one — `addPane` had a race condition where parallel `split-window` and `display-message` calls could return the same pane index, causing only the last repo's command to execute

## [0.0.20] 2026-03-04

### Changed

- Status model replaced: `WorktreeStatus` now uses `clean | dirty | error` with numeric `untracked`, `uncommitted`, and `unpushed` counts instead of the old `clean | uncommitted | ahead | error` model
- Status output uses count-based text summaries (e.g. `3 untracked, 2 uncommitted, 1 unpushed commit`) instead of icons — clean repos show `clean`
- `hasIssues()` now only considers untracked and uncommitted changes as blockers; unpushed commits are safe in worktrees and no longer prevent `drop` or `prune`
- `baseBranch` concept removed from the entire status chain — `checkWorkspaceStatus`, `listWorkspacesWithStatus`, `discoverPrunableWorkspaces`, and `removeWorkspace` no longer depend on `WorkspaceConfigService`
- Tracking info (upstream branch / `no upstream`) removed from per-repo status lines

### Fixed

- `createBranch` now prefers `origin/<branch>` as the start point when creating a new branch, falling back to the local branch ref when no remote-tracking ref exists

## [0.0.19] 2026-03-01

### Changed

- `flow drop` status display now uses the same format as `flow status` — shows workspace header with fetching indicator, then per-repo status with indicators, tracking info, and consistent styling
- `flow drop` now blocks before the confirmation prompt when uncommitted changes are detected — the user sees the status output with issues highlighted, then must resolve them before dropping
- `flow prune` now consolidates display with `flow list` — shows full workspace status (identical format with per-repo details) before the selection prompt, then excludes any workspaces with uncommitted changes or errors from being selectable. Skipped workspaces are clearly marked with reason.
- `flow prune` now exits early if all workspaces have uncommitted changes or errors, with a helpful message to resolve issues first

### Fixed

- `flow prune` previously allowed selection of workspaces with uncommitted changes, only to fail during removal. Users can now only select clean workspaces, preventing wasted interaction.

## [0.0.18] - 2026-03-01

- Renamed `add` command to `attach`
- Renamed `remove` command to `drop`
- Removed `clean` alias from `prune` command
- Renamed `branch` command to `create`; `branch` is kept as a deprecated alias that redirects to `create`
- `flow fetch` is now workspace-scoped when a branch name is provided; fetches all repos across all workspaces when no branch is given
- Renamed `tmux resume` subcommand to `tmux sync`
- `create` and `attach` commands now gracefully handle existing branches — uses the branch if it already exists instead of erroring

## [0.0.17] - 2026-02-28

### Added

- `flow attach [branch-name]` command — attach repos to an existing workspace interactively. Presents a repo picker (excluding repos already in the workspace), creates worktrees with new branches, copies config files, and runs post-checkout commands. Auto-detects the workspace from the current directory, or accepts an explicit branch name.
- Repo-level `flow-config.json` support — individual repos can now define `copy-files` and `post-checkout` settings at their root. Applies to `branch`, `checkout`, and `attach` commands.

### Changed

- `CreateBranchWorkspaceUseCase` now delegates worktree creation to the new shared `AddReposToWorkspaceUseCase`, reducing duplication between `branch` and `add` workflows

## [0.0.16] - 2026-02-22

### Changed

- `flow status` output now matches `flow list` format — shows workspace name and repo count as a header, displays a `fetching...` indicator while loading, and removes the separate `Summary:` line
- Extracted shared `logStatusFetching` and `logStatus` display helpers used by both `flow status` and `flow list`

## [0.0.15] - 2026-02-22

### Added

- New `branch-auto-select-repos` config option — a comma-separated list of repo names that are pre-checked in the `flow branch` interactive prompt
- `flow branch` now tracks how often each repo is selected and surfaces the most-used repos (up to 8) in a "Recently Used" group at the top of the selection list, in alphabetical order
- `flow quickstart` — interactive setup wizard that walks through required (`source-path`, `dest-path`) and optional (`post-checkout`, `tmux`) configuration, with existing values pre-filled as editable text

### Changed

- `flow status` per-repo output now matches `flow list` format — includes tracking branch and consistent styling
- Fetch cache file renamed from `fetch-cache.json` to `flow-cache.json` and now also stores branch repo usage counts
- Workspace directories are now identified by the presence of `flow-config.json` rather than by containing git worktrees, making workspace detection more explicit and reliable

## [0.0.14] - 2026-02-19

### Added

- `flow list` now shows a per-repo breakdown with status and remote tracking branch for each worktree

### Fixed

- Fixed incorrect upstream tracking when creating new branches - new feature branches no longer track the source branch (e.g., `origin/trunk`), preventing accidental pushes to the wrong remote branch

## [0.0.13] - 2026-02-14

### Changed

- Post-checkout commands now spawn in tmux panes when tmux is enabled, allowing real-time output visibility
- Worktree count now only includes directories with `.git` folders (more accurate workspace statistics)

## [0.0.12] - 2026-02-13

### Fixed

- Fixed local branch checkout issue where branches couldn't be properly checked out from local refs

### Changed

- Tmux sessions now only create split views for directories with `.git` folders
- Simplified tmux resume functionality

## [0.0.10] - 2026-02-12

### Added

- Interactive prune command - select workspaces to remove with visual status indicators
- Helper utilities extracted for workspace selection UI

### Changed

- `drop` and `prune` commands now consider unpushed changes as safe to delete (since worktrees preserve git history)
- Changed status safety checks - only uncommitted changes block removal

## [0.0.9] - 2026-02-12

### Added

- Base branch tracking - workspaces now track which branch they were created from
- Workspace config file (`.flow-config.json`) stores workspace metadata

### Changed

- Branch creation now branches from origin instead of local refs
- Status comparison now uses code diff (`git diff`) instead of commit comparison for better accuracy with squash-merged branches
- Improved handling of squash-merged branches in "ahead of main" detection

## [0.0.8] - 2026-02-10

### Added

- Per-repo configuration listing in `flow config` command

## [0.0.7] - 2026-02-10

### Added

- Standalone `flow fetch` command for fetching all repos without other operations
- `flow tmux resume` command - creates tmux sessions for all workspaces with split panes

## [0.0.6] - 2026-02-09

### Added

- Per-repo post-checkout commands - configure different commands for specific repos
- Fetch caching with TTL (time-to-live) to avoid unnecessary git fetch operations
- New use cases: `fetchAllRepos`, `fetchUsedRepos`, `fetchWorkspaceRepos`

### Changed

- Fetch operations now cache results for improved performance
- Commands that need fresh data automatically fetch with cache validation

## [0.0.5] - 2026-02-09

### Fixed

- Build process now correctly sets executable permissions on `dist/cli.js`

## [0.0.4] - 2026-02-09

### Added

- Status information in `flow list` command showing uncommitted changes and commits ahead of main
- Prune command summary improvements

## [0.0.3] - 2026-02-08

### Added

- Tmux integration - automatically create tmux sessions with split panes for workspace root and each worktree
- Tiled layout for tmux panes

## [0.0.2] - 2026-02-08

### Changed

- README updates and documentation improvements

## [0.0.1] - 2026-02-08

### Added

- Initial public release
- Core commands: `branch`, `checkout`, `push`, `pull`, `status`, `drop`, `list`, `prune`
- Git worktree management across multiple repositories
- Interactive repo selection for branch creation
- Workspace-level operations (push, pull, status)
- Safe cleanup with uncommitted change detection
- Configuration management (`~/.config/flow/config.json`)
- Post-checkout hooks for running setup commands
- File copying from source repos to worktrees (`.env` by default)
- `AGENTS.md` file copying for AI coding context
- Parallel git operations with visual progress spinners
- Hexagonal architecture with use cases and services
- Comprehensive test suite (unit and integration tests)
