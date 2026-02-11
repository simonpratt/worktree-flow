import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { WorkspaceConfigService } from '../workspaceConfig.js';
import { createMemFs } from '../../test/test-utils.js';

describe('WorkspaceConfigService', () => {
  const workspacePath = '/workspaces/feature-x';
  const configPath = path.join(workspacePath, 'flow-config.json');

  describe('exists', () => {
    it('should return false when config file does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceConfigService(fs);

      const result = service.exists(workspacePath);

      expect(result).toBe(false);
    });

    it('should return true when config file exists', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ baseBranches: {} }),
      });
      const service = new WorkspaceConfigService(fs);

      const result = service.exists(workspacePath);

      expect(result).toBe(true);
    });
  });

  describe('load', () => {
    it('should return empty baseBranches when config file does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceConfigService(fs);

      const config = service.load(workspacePath);

      expect(config).toEqual({ baseBranches: {} });
    });

    it('should read and parse config file when it exists', () => {
      const configData = {
        baseBranches: {
          'repo-1': 'master',
          'repo-2': 'main',
          'repo-3': 'develop',
        },
      };
      const { fs } = createMemFs({
        [configPath]: JSON.stringify(configData),
      });
      const service = new WorkspaceConfigService(fs);

      const config = service.load(workspacePath);

      expect(config).toEqual(configData);
    });

    it('should throw error for invalid config schema', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          baseBranches: 'invalid',
        }),
      });
      const service = new WorkspaceConfigService(fs);

      expect(() => service.load(workspacePath)).toThrow();
    });
  });

  describe('save', () => {
    it('should write config file with proper formatting', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceConfigService(fs);

      // Create the workspace directory first
      fs.mkdirSync(workspacePath, { recursive: true });

      const config = {
        baseBranches: {
          'repo-1': 'master',
          'repo-2': 'main',
        },
      };

      service.save(workspacePath, config);

      const written = JSON.parse(vol.readFileSync(configPath, 'utf-8') as string);
      expect(written).toEqual(config);
    });

    it('should validate config before saving', () => {
      const { vol, fs } = createMemFs();
      const service = new WorkspaceConfigService(fs);

      // Create the workspace directory first
      fs.mkdirSync(workspacePath, { recursive: true });

      const invalidConfig = {
        baseBranches: 'invalid' as any,
      };

      expect(() => service.save(workspacePath, invalidConfig)).toThrow();
      expect(vol.existsSync(configPath)).toBe(false);
    });
  });

  describe('getBaseBranch', () => {
    it('should return base branch for repo when it exists in config', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          baseBranches: {
            'repo-1': 'master',
            'repo-2': 'main',
          },
        }),
      });
      const service = new WorkspaceConfigService(fs);

      const branch = service.getBaseBranch(workspacePath, 'repo-1');

      expect(branch).toBe('master');
    });

    it('should return master as fallback when config does not exist', () => {
      const { fs } = createMemFs();
      const service = new WorkspaceConfigService(fs);

      const branch = service.getBaseBranch(workspacePath, 'repo-1');

      expect(branch).toBe('master');
    });

    it('should return master as fallback when repo not in config', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          baseBranches: {
            'repo-1': 'main',
          },
        }),
      });
      const service = new WorkspaceConfigService(fs);

      const branch = service.getBaseBranch(workspacePath, 'repo-2');

      expect(branch).toBe('master');
    });
  });
});
