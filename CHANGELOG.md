# Changelog

## Unreleased

### Changed

- `flow status` per-repo output now matches `flow list` format — includes tracking branch and consistent styling

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

- `remove` and `prune` commands now consider unpushed changes as safe to delete (since worktrees preserve git history)
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
- Core commands: `branch`, `checkout`, `push`, `pull`, `status`, `remove`, `list`, `prune`
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
