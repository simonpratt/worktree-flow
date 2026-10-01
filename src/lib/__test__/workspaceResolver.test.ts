import { describe, it, expect } from 'vitest';
import path from 'node:path';
import * as sinon from 'sinon';
import { resolveWorkspace, tryResolveWorkspace } from '../workspaceResolver.js';
import { NotInWorkspaceError, WorkspaceNotFoundError } from '../errors.js';
import { WorkspaceDirectoryService } from '../workspaceDirectory.js';
import { WorkspaceConfigService } from '../workspaceConfig.js';
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();

      const result = resolveWorkspace(branchName, workspaceDir, workspaceConfig, config, mockProcess);

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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();

      expect(() => resolveWorkspace(branchName, workspaceDir, workspaceConfig, config, mockProcess)).toThrow(
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();

      expect(() => resolveWorkspace(branchName, workspaceDir, workspaceConfig, config, mockProcess)).toThrow(
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(workspacePath);

      const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      expect(() => resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess)).toThrow(
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(destPath);

      expect(() => resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess)).toThrow(
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      expect(() => resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess)).toThrow(
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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns('/some/other/path');

      // Should not use cwd when branch name is provided
      const result = resolveWorkspace(branchName, workspaceDir, workspaceConfig, config, mockProcess);

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
      const workspaceConfig = new WorkspaceConfigService(fs);
      const mockProcess = createMockProcess();
      mockProcess.cwd.returns(cwd);

      const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

      expect(result.displayName).toBe(branchName);
    });
  });
});

describe('resolveWorkspace with a persisted branch name', () => {
  const destPath = '/workspaces';
  const branchName = 'feature/ABC-1.2';
  const workspacePath = path.join(destPath, 'feature_ABC-1_2');

  function setup(flowConfig: object) {
    const { fs } = createMemFs({
      [getConfigPath()]: JSON.stringify({ 'source-path': '/source', 'dest-path': destPath }),
      [path.join(workspacePath, 'flow-config.json')]: JSON.stringify(flowConfig),
      [path.join(workspacePath, 'repo1', '.git')]: '',
    });
    const mockProcess = createMockProcess();
    mockProcess.cwd.returns(path.join(workspacePath, 'repo1'));
    return {
      workspaceDir: new WorkspaceDirectoryService(fs),
      workspaceConfig: new WorkspaceConfigService(fs),
      config: new ConfigService(fs),
      mockProcess,
    };
  }

  it('should return the real branch name, not the sanitized folder name, when auto-detecting', () => {
    const { workspaceDir, workspaceConfig, config, mockProcess } = setup({ branchName, baseBranches: {} });

    const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

    expect(result).toEqual({ workspacePath, displayName: branchName });
  });

  it('should return the real branch name when the workspace is named by its folder name', () => {
    const { workspaceDir, workspaceConfig, config, mockProcess } = setup({ branchName, baseBranches: {} });

    const result = resolveWorkspace('feature_ABC-1_2', workspaceDir, workspaceConfig, config, mockProcess);

    expect(result).toEqual({ workspacePath, displayName: branchName });
  });

  it('should fall back to the folder name for workspaces without a persisted branch name', () => {
    const { workspaceDir, workspaceConfig, config, mockProcess } = setup({ baseBranches: {} });

    const result = resolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

    expect(result.displayName).toBe('feature_ABC-1_2');
  });
});

describe('tryResolveWorkspace', () => {
  it('should return the resolution when workspace is found', () => {
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
    const workspaceConfig = new WorkspaceConfigService(fs);
    const mockProcess = createMockProcess();

    const result = tryResolveWorkspace(branchName, workspaceDir, workspaceConfig, config, mockProcess);

    expect(result).toEqual({ workspacePath, displayName: branchName });
  });

  it('should return null when workspace is not found', () => {
    const destPath = '/workspaces';

    const { fs } = createMemFs({
      [getConfigPath()]: JSON.stringify({
        'source-path': '/source',
        'dest-path': destPath,
      }),
    });

    const config = new ConfigService(fs);
    const workspaceDir = new WorkspaceDirectoryService(fs);
    const workspaceConfig = new WorkspaceConfigService(fs);
    const mockProcess = createMockProcess();

    const result = tryResolveWorkspace('non-existent', workspaceDir, workspaceConfig, config, mockProcess);

    expect(result).toBeNull();
  });

  it('should return null when cwd is outside dest path', () => {
    const destPath = '/workspaces';

    const { fs } = createMemFs({
      [getConfigPath()]: JSON.stringify({
        'source-path': '/source',
        'dest-path': destPath,
      }),
    });

    const config = new ConfigService(fs);
    const workspaceDir = new WorkspaceDirectoryService(fs);
    const workspaceConfig = new WorkspaceConfigService(fs);
    const mockProcess = createMockProcess();
    mockProcess.cwd.returns('/home/user/projects');

    const result = tryResolveWorkspace(undefined, workspaceDir, workspaceConfig, config, mockProcess);

    expect(result).toBeNull();
  });
});
