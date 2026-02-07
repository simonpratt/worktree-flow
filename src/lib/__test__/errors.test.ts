import { describe, it, expect } from 'vitest';
import {
  ConfigNotSetError,
  WorkspaceNotFoundError,
  WorkspaceAlreadyExistsError,
  NoReposFoundError,
  WorkspaceHasIssuesError,
  NotInWorkspaceError,
} from '../errors.js';

describe('Error Classes', () => {
  describe('ConfigNotSetError', () => {
    it('should create error with custom message', () => {
      const error = new ConfigNotSetError('Custom message');
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('ConfigNotSetError');
      expect(error).toBeInstanceOf(Error);
    });

    it('should create error with default message', () => {
      const error = new ConfigNotSetError();
      expect(error.message).toBe('Configuration not set');
      expect(error.name).toBe('ConfigNotSetError');
    });
  });

  describe('WorkspaceNotFoundError', () => {
    it('should create error with path', () => {
      const error = new WorkspaceNotFoundError('/path/to/workspace');
      expect(error.message).toBe('Workspace not found: /path/to/workspace');
      expect(error.name).toBe('WorkspaceNotFoundError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('WorkspaceAlreadyExistsError', () => {
    it('should create error with path', () => {
      const error = new WorkspaceAlreadyExistsError('/path/to/workspace');
      expect(error.message).toBe('Workspace already exists: /path/to/workspace');
      expect(error.name).toBe('WorkspaceAlreadyExistsError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NoReposFoundError', () => {
    it('should create error with path', () => {
      const error = new NoReposFoundError('/path/to/source');
      expect(error.message).toBe('No git repositories found in /path/to/source');
      expect(error.name).toBe('NoReposFoundError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('WorkspaceHasIssuesError', () => {
    it('should create error with message', () => {
      const error = new WorkspaceHasIssuesError('Multiple issues found');
      expect(error.message).toBe('Multiple issues found');
      expect(error.name).toBe('WorkspaceHasIssuesError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotInWorkspaceError', () => {
    it('should create error with dest path', () => {
      const error = new NotInWorkspaceError('/path/to/workspaces');
      expect(error.message).toContain('Not inside a flow workspace');
      expect(error.message).toContain('/path/to/workspaces');
      expect(error.name).toBe('NotInWorkspaceError');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
