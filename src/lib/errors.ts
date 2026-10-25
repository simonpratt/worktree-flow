/**
 * Domain-specific error classes.
 */

export class ConfigNotSetError extends Error {
  constructor(message: string = 'Configuration not set') {
    super(message);
    this.name = 'ConfigNotSetError';
  }
}

export class InvalidWorkspacePathsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorkspacePathsError';
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(path: string) {
    super(`Workspace not found: ${path}`);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceAlreadyExistsError extends Error {
  constructor(path: string) {
    super(`Workspace already exists: ${path}`);
    this.name = 'WorkspaceAlreadyExistsError';
  }
}

export class NoReposFoundError extends Error {
  constructor(path: string) {
    super(`No git repositories found in ${path}`);
    this.name = 'NoReposFoundError';
  }
}

export class WorkspaceHasIssuesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceHasIssuesError';
  }
}

export class RepoNotFoundError extends Error {
  constructor(repoName: string, availableRepos: string[]) {
    super(`Repo "${repoName}" not found. Available repos: ${availableRepos.join(', ')}`);
    this.name = 'RepoNotFoundError';
  }
}

export class RepoGroupNotFoundError extends Error {
  constructor(groupName: string, availableGroups: string[]) {
    super(
      availableGroups.length > 0
        ? `Repo group "${groupName}" not found. Available groups: ${availableGroups.join(', ')}`
        : `Repo group "${groupName}" not found. Create one with: flow group set <name> <repo...>`
    );
    this.name = 'RepoGroupNotFoundError';
  }
}

export class EmptyRepoGroupError extends Error {
  constructor(groupNames: string[]) {
    super(`None of the repos in group(s) ${groupNames.join(', ')} are in the source-path.`);
    this.name = 'EmptyRepoGroupError';
  }
}

export class NotInWorkspaceError extends Error {
  constructor(destPath: string) {
    super(`Not inside a flow workspace.\nNavigate to a directory under ${destPath}/.`);
    this.name = 'NotInWorkspaceError';
  }
}

export class PromptCancelledError extends Error {
  constructor() {
    super('Prompt cancelled');
    this.name = 'PromptCancelledError';
  }
}

export class UnsafeTrashPathError extends Error {
  constructor(path: string) {
    super(`Refusing to delete path that was not created by the trash: ${path}`);
    this.name = 'UnsafeTrashPathError';
  }
}
