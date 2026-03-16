import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { WorkspaceDirectoryService, sanitizeBranchForFolder } from '../workspaceDirectory.js';
import { WorkspaceAlreadyExistsError } from '../errors.js';
import { createMemFs } from '../../test/test-utils.js';

describe('sanitizeBranchForFolder', () => {
  it('should replace forward slashes with underscores', () => {
    expect(sanitizeBranchForFolder('release/123')).toBe('release_123');
  });

  it('should replace backslashes with underscores', () => {
    expect(sanitizeBranchForFolder('release\\123')).toBe('release_123');
  });

  it('should replace colons with underscores', () => {
    expect(sanitizeBranchForFolder('fix:urgent')).toBe('fix_urgent');
  });

  it('should replace multiple special characters', () => {
    expect(sanitizeBranchForFolder('user@domain/feature#1')).toBe('user_domain_feature_1');
  });

  it('should preserve alphanumeric characters, dashes, dots, and underscores', () => {
    expect(sanitizeBranchForFolder('my-branch_v1.0')).toBe('my-branch_v1.0');
  });

  it('should leave simple branch names unchanged', () => {
    expect(sanitizeBranchForFolder('feature-123')).toBe('feature-123');
  });
});

describe('WorkspaceDirectoryService', () => {
  describe('createWorkspaceDir', () => {
    it('should create workspace directory when it does not exist', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);
      const destPath = '/workspaces';
      const branch = 'feature-123';

      const workspacePath = service.createWorkspaceDir(destPath, branch);

      expect(workspacePath).toBe(path.join(destPath, branch));
      expect(vol.existsSync(workspacePath)).toBe(true);
    });

    it('should create parent directories if they do not exist', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);
      const destPath = '/deep/nested/workspaces';
      const branch = 'feature-123';

      const workspacePath = service.createWorkspaceDir(destPath, branch);

      expect(vol.existsSync(workspacePath)).toBe(true);
      expect(vol.existsSync(destPath)).toBe(true);
    });

    it('should sanitize branch names with special characters', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);
      const destPath = '/workspaces';
      const branch = 'release/123';

      const workspacePath = service.createWorkspaceDir(destPath, branch);

      expect(workspacePath).toBe(path.join(destPath, 'release_123'));
      expect(vol.existsSync(workspacePath)).toBe(true);
    });

    it('should throw WorkspaceAlreadyExistsError when workspace already exists', () => {
      const destPath = '/workspaces';
      const branch = 'feature-123';
      const { fs } = createMemFs({
        [path.join(destPath, branch, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      expect(() => service.createWorkspaceDir(destPath, branch)).toThrow(
        WorkspaceAlreadyExistsError
      );
    });

  });

  describe('copyAgentsMd', () => {
    it('should copy AGENTS.md when it exists in source path', () => {
      const sourcePath = '/source';
      const workspacePath = '/workspaces/feature-123';
      const agentsContent = '# Agents Documentation';
      const { vol, fs } = createMemFs({
        [path.join(sourcePath, 'AGENTS.md')]: agentsContent,
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      service.copyAgentsMd(sourcePath, workspacePath);

      const copiedContent = vol.readFileSync(
        path.join(workspacePath, 'AGENTS.md'),
        'utf-8'
      );
      expect(copiedContent).toBe(agentsContent);
    });

    it('should not throw when AGENTS.md does not exist', () => {
      const sourcePath = '/source';
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      expect(() => service.copyAgentsMd(sourcePath, workspacePath)).not.toThrow();
      expect(vol.existsSync(path.join(workspacePath, 'AGENTS.md'))).toBe(false);
    });
  });

  describe('copyDevcontainer', () => {
    it('should copy .devcontainer folder when it exists in source path', () => {
      const sourcePath = '/source';
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(sourcePath, '.devcontainer', 'devcontainer.json')]: '{"name":"test"}',
        [path.join(sourcePath, '.devcontainer', 'Dockerfile')]: 'FROM node:24',
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      service.copyDevcontainer(sourcePath, workspacePath);

      expect(
        vol.readFileSync(path.join(workspacePath, '.devcontainer', 'devcontainer.json'), 'utf-8')
      ).toBe('{"name":"test"}');
      expect(
        vol.readFileSync(path.join(workspacePath, '.devcontainer', 'Dockerfile'), 'utf-8')
      ).toBe('FROM node:24');
    });

    it('should not throw when .devcontainer does not exist', () => {
      const sourcePath = '/source';
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      expect(() => service.copyDevcontainer(sourcePath, workspacePath)).not.toThrow();
      expect(vol.existsSync(path.join(workspacePath, '.devcontainer'))).toBe(false);
    });

    it('should copy nested subdirectories within .devcontainer', () => {
      const sourcePath = '/source';
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(sourcePath, '.devcontainer', 'scripts', 'setup.sh')]: '#!/bin/bash',
        [path.join(sourcePath, '.devcontainer', 'devcontainer.json')]: '{}',
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      service.copyDevcontainer(sourcePath, workspacePath);

      expect(
        vol.readFileSync(path.join(workspacePath, '.devcontainer', 'scripts', 'setup.sh'), 'utf-8')
      ).toBe('#!/bin/bash');
    });
  });

  describe('detectWorkspace', () => {
    it('should detect workspace when cwd is directly inside dest path', () => {
      const destPath = '/workspaces';
      const workspaceName = 'feature-123';
      const cwd = path.join(destPath, workspaceName);
      const { fs } = createMemFs({
        [path.join(cwd, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(cwd, destPath);

      expect(detected).toBe(cwd);
    });

    it('should detect workspace when cwd is nested inside workspace', () => {
      const destPath = '/workspaces';
      const workspaceName = 'feature-123';
      const workspacePath = path.join(destPath, workspaceName);
      const cwd = path.join(workspacePath, 'repo1', 'src');
      const { fs } = createMemFs({
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(cwd, destPath);

      expect(detected).toBe(workspacePath);
    });

    it('should return null when cwd is outside dest path', () => {
      const destPath = '/workspaces';
      const cwd = '/home/user/projects';
      const { fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(cwd, destPath);

      expect(detected).toBe(null);
    });

    it('should return null when cwd is the dest path itself', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs({
        [path.join(destPath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(destPath, destPath);

      expect(detected).toBe(null);
    });

    it('should return null when workspace directory does not exist', () => {
      const destPath = '/workspaces';
      const cwd = path.join(destPath, 'non-existent-workspace', 'repo');
      const { fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(cwd, destPath);

      expect(detected).toBe(null);
    });

    it('should return null when workspace directory exists but has no flow-config.json', () => {
      const destPath = '/workspaces';
      const workspacePath = path.join(destPath, 'feature-123');
      const { fs } = createMemFs({
        [path.join(workspacePath, '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(path.join(workspacePath, 'repo1'), destPath);

      expect(detected).toBe(null);
    });

    it('should handle paths with trailing slashes correctly', () => {
      const destPath = '/workspaces';
      const workspaceName = 'feature-123';
      const workspacePath = path.join(destPath, workspaceName);
      const cwd = path.join(workspacePath, 'repo1');
      const { fs } = createMemFs({
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceDirectoryService(fs);

      const detected = service.detectWorkspace(cwd + '/', destPath + '/');

      expect(detected).toBe(workspacePath);
    });
  });

  describe('getWorktreeDirs', () => {
    it('should return empty array when workspace has no directories', () => {
      const workspacePath = '/workspaces/feature-123';
      const { fs } = createMemFs({
        [path.join(workspacePath, 'file.txt')]: 'content',
      });
      const service = new WorkspaceDirectoryService(fs);

      const dirs = service.getWorktreeDirs(workspacePath);

      expect(dirs).toEqual([]);
    });

    it('should return all directories in workspace', () => {
      const workspacePath = '/workspaces/feature-123';
      const { fs } = createMemFs({
        [path.join(workspacePath, 'repo1', '.git')]: '',
        [path.join(workspacePath, 'repo2', '.git')]: '',
        [path.join(workspacePath, 'file.txt')]: 'content',
      });
      const service = new WorkspaceDirectoryService(fs);

      const dirs = service.getWorktreeDirs(workspacePath);

      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(path.join(workspacePath, 'repo1'));
      expect(dirs).toContain(path.join(workspacePath, 'repo2'));
    });

    it('should filter out files and only return git directories', () => {
      const workspacePath = '/workspaces/feature-123';
      const { fs } = createMemFs({
        [path.join(workspacePath, 'repo1', '.git')]: '',
        [path.join(workspacePath, 'repo1', 'README.md')]: '',
        [path.join(workspacePath, 'repo2', '.git')]: '',
        [path.join(workspacePath, 'repo2', 'package.json')]: '{}',
        [path.join(workspacePath, 'AGENTS.md')]: '',
        [path.join(workspacePath, '.gitignore')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const dirs = service.getWorktreeDirs(workspacePath);

      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(path.join(workspacePath, 'repo1'));
      expect(dirs).toContain(path.join(workspacePath, 'repo2'));
    });

    it('should only return directories that are git repositories (have .git)', () => {
      const workspacePath = '/workspaces/feature-123';
      const { fs } = createMemFs({
        [path.join(workspacePath, 'repo1', '.git')]: '',
        [path.join(workspacePath, 'repo2', '.git')]: '',
        [path.join(workspacePath, 'node_modules', 'package.json')]: '{}',
        [path.join(workspacePath, '.vscode', 'settings.json')]: '{}',
        [path.join(workspacePath, 'random-folder', 'file.txt')]: '',
        [path.join(workspacePath, 'AGENTS.md')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const dirs = service.getWorktreeDirs(workspacePath);

      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(path.join(workspacePath, 'repo1'));
      expect(dirs).toContain(path.join(workspacePath, 'repo2'));
      expect(dirs).not.toContain(path.join(workspacePath, 'node_modules'));
      expect(dirs).not.toContain(path.join(workspacePath, '.vscode'));
      expect(dirs).not.toContain(path.join(workspacePath, 'random-folder'));
    });
  });

  describe('listWorkspaces', () => {
    it('should return empty array when dest path does not exist', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toEqual([]);
    });

    it('should return empty array when dest path has no directories', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs({
        [path.join(destPath, 'file.txt')]: 'content',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toEqual([]);
    });

    it('should return workspace with correct repo count', () => {
      const destPath = '/workspaces';
      const workspaceName = 'feature-123';
      const workspacePath = path.join(destPath, workspaceName);
      const { fs } = createMemFs({
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(workspacePath, 'repo1', '.git')]: '',
        [path.join(workspacePath, 'repo2', '.git')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]).toEqual({
        name: workspaceName,
        path: workspacePath,
        repoCount: 2,
      });
    });

    it('should return multiple workspaces', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs({
        [path.join(destPath, 'feature-123', 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, 'feature-123', 'repo1', '.git')]: '',
        [path.join(destPath, 'feature-456', 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, 'feature-456', 'repo1', '.git')]: '',
        [path.join(destPath, 'feature-456', 'repo2', '.git')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toHaveLength(2);
      expect(workspaces.find(ws => ws.name === 'feature-123')).toEqual({
        name: 'feature-123',
        path: path.join(destPath, 'feature-123'),
        repoCount: 1,
      });
      expect(workspaces.find(ws => ws.name === 'feature-456')).toEqual({
        name: 'feature-456',
        path: path.join(destPath, 'feature-456'),
        repoCount: 2,
      });
    });

    it('should filter out directories without flow-config.json', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs({
        [path.join(destPath, 'feature-123', 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, 'empty-workspace', 'file.txt')]: '',
        [path.join(destPath, 'another-empty', '.gitkeep')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('feature-123');
    });

    it('should include workspace with flow-config.json even if it has zero repos', () => {
      const destPath = '/workspaces';
      const workspacePath = path.join(destPath, 'empty-but-valid');
      const { fs } = createMemFs({
        [path.join(workspacePath, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]).toEqual({ name: 'empty-but-valid', path: workspacePath, repoCount: 0 });
    });

    it('should handle errors when reading workspace directories', () => {
      const destPath = '/workspaces';
      const { fs } = createMemFs({
        [path.join(destPath, 'valid-workspace', 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, 'valid-workspace', 'repo1', '.git')]: '',
        [path.join(destPath, 'invalid-file')]: 'not a directory',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspaces = service.listWorkspaces(destPath);

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('valid-workspace');
    });
  });

  describe('removeWorkspaceDir', () => {
    it('should remove workspace directory recursively', () => {
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(workspacePath, 'repo1', 'file.txt')]: 'content',
        [path.join(workspacePath, 'repo2', 'nested', 'file.txt')]: 'content',
      });
      const service = new WorkspaceDirectoryService(fs);

      service.removeWorkspaceDir(workspacePath);

      expect(vol.existsSync(workspacePath)).toBe(false);
    });

    it('should not throw when workspace does not exist', () => {
      const workspacePath = '/workspaces/non-existent';
      const { fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);

      expect(() => service.removeWorkspaceDir(workspacePath)).not.toThrow();
    });
  });

  describe('findWorkspace', () => {
    it('should return workspace when it exists', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const { fs } = createMemFs({
        [path.join(destPath, branchName, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, branchName, 'repo1', '.git')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspace = service.findWorkspace(destPath, branchName);

      expect(workspace).toEqual({
        name: branchName,
        path: path.join(destPath, branchName),
        repoCount: 1,
      });
    });

    it('should return null when workspace does not exist', () => {
      const destPath = '/workspaces';
      const branchName = 'non-existent';
      const { fs } = createMemFs({
        [path.join(destPath, 'other-branch', 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, 'other-branch', 'repo1', '.git')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspace = service.findWorkspace(destPath, branchName);

      expect(workspace).toBe(null);
    });

    it('should return null when dest path is empty', () => {
      const destPath = '/workspaces';
      const branchName = 'feature-123';
      const { fs } = createMemFs();
      const service = new WorkspaceDirectoryService(fs);

      const workspace = service.findWorkspace(destPath, branchName);

      expect(workspace).toBe(null);
    });

    it('should find workspace using sanitized branch name', () => {
      const destPath = '/workspaces';
      const sanitizedName = 'release_123';
      const { fs } = createMemFs({
        [path.join(destPath, sanitizedName, 'flow-config.json')]: JSON.stringify({ baseBranches: {} }),
        [path.join(destPath, sanitizedName, 'repo1', '.git')]: '',
      });
      const service = new WorkspaceDirectoryService(fs);

      const workspace = service.findWorkspace(destPath, 'release/123');

      expect(workspace).toEqual({
        name: sanitizedName,
        path: path.join(destPath, sanitizedName),
        repoCount: 1,
      });
    });
  });
});
