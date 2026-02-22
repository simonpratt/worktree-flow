import { describe, it, expect } from 'vitest';
import path from 'node:path';
import * as sinon from 'sinon';
import { resolveWorkspace } from '../workspaceResolver.js';
import { NotInWorkspaceError, WorkspaceNotFoundError } from '../errors.js';
import { WorkspaceDirectoryService } from '../workspaceDirectory.js';
import { ConfigService } from '../config.js';
import type { IProcess } from '../../adapters/types.js';
import { createMemFs, createMockProcess } from '../../test/test-utils.js';
import { getConfigPath } from '../config.js';

describe('resolveWorkspace', () => {
  describe('with explicit branch name', () => {
    it('should resolve workspace when it exists', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const workspacePath = path.join(destPath, branchName);

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();

      const result = resolveWorkspace(branchName, workspaceDir, config, mockProcess);

      expect(result).toEqual({
        workspacePath,
        displayName: branchName,
      });
    });

    it('should throw WorkspaceNotFoundError when workspace does not exist', () => {
      const destPath = '/workspaces';
      const branchName = 'non-existent';

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();

      expect(() => resolveWorkspace(branchName, workspaceDir, config, mockProcess)).toThrow(
        WorkspaceNotFoundError
      );
    });

    it('should throw WorkspaceNotFoundError when workspace directory exists but has no repos', () => {
      const destPath = '/workspaces';
      const branchName = 'empty-workspace';
      const workspacePath = path.join(destPath, branchName);

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'file.txt')]: 'content',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();

      expect(() => resolveWorkspace(branchName, workspaceDir, config, mockProcess)).toThrow(
        WorkspaceNotFoundError
      );
    });
  });

  describe('auto-detection from current directory', () => {
    it('should detect workspace when cwd is inside workspace', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const workspacePath = path.join(destPath, branchName);
      const cwd = path.join(workspacePath, 'repo1');

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, config, mockProcess);

      expect(result).toEqual({
        workspacePath,
        displayName: branchName,
      });
    });

    it('should detect workspace when cwd is the workspace root', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const workspacePath = path.join(destPath, branchName);

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(workspacePath);

      const result = resolveWorkspace(undefined, workspaceDir, config, mockProcess);

      expect(result).toEqual({
        workspacePath,
        displayName: branchName,
      });
    });

    it('should detect workspace when cwd is deeply nested', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const workspacePath = path.join(destPath, branchName);
      const cwd = path.join(workspacePath, 'repo1', 'src', 'components');

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, config, mockProcess);

      expect(result).toEqual({
        workspacePath,
        displayName: branchName,
      });
    });

    it('should throw NotInWorkspaceError when cwd is outside dest path', () => {
      const destPath = '/workspaces';
      const cwd = '/home/user/projects';

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      expect(() => resolveWorkspace(undefined, workspaceDir, config, mockProcess)).toThrow(
        NotInWorkspaceError
      );
    });

    it('should throw NotInWorkspaceError when cwd is dest path itself', () => {
      const destPath = '/workspaces';

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(destPath, '.gitkeep')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(destPath);

      expect(() => resolveWorkspace(undefined, workspaceDir, config, mockProcess)).toThrow(
        NotInWorkspaceError
      );
    });

    it('should throw NotInWorkspaceError when detected workspace does not exist', () => {
      const destPath = '/workspaces';
      const cwd = path.join(destPath, 'non-existent', 'repo');

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      expect(() => resolveWorkspace(undefined, workspaceDir, config, mockProcess)).toThrow(
        NotInWorkspaceError
      );
    });
  });

  describe('edge cases', () => {
    it('should use process.cwd() only when branch name is undefined', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const workspacePath = path.join(destPath, branchName);

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns('/some/other/path');

      // Should not use cwd when branch name is provided
      const result = resolveWorkspace(branchName, workspaceDir, config, mockProcess);

      expect(result.workspacePath).toBe(workspacePath);
      expect(mockProcess.cwd.called).toBe(false);
    });

    it('should extract display name from workspace path when auto-detecting', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-with-special-chars_123';
      const workspacePath = path.join(destPath, branchName);
      const cwd = path.join(workspacePath, 'repo1');

      const { fs } = createMemFs({
        [getConfigPath()]: JSON.stringify({
          'source-path': '/source',
          'dest-path': destPath,
        }),
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
      });

      const config = new ConfigService(fs);
      const workspaceDir = new WorkspaceDirectoryService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, config, mockProcess);

      expect(result.displayName).toBe(branchName);
    });
  });
});
