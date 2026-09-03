/**
 * Domain-specific error classes.
 */

export class ConfigNotSetError extends Error {
  constructor(message: string = 'Configuration not set') {
    super(message);
    this.name = 'ConfigNotSetError';
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

export class NotInWorkspaceError extends Error {
  constructor(destPath: string) {
    super(`Not inside a flow workspace.\nNavigate to a directory under ${destPath}/.`);
    this.name = 'NotInWorkspaceError';
  }
}
