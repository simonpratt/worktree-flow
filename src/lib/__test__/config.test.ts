import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  ConfigService,
  validateAndTransformConfigValue,
  validateWorkspacePaths,
  defaultDestPath,
  isValidKey,
  getConfigPath,
} from '../config.js';
import { ConfigNotSetError, InvalidWorkspacePathsError } from '../errors.js';
import { createMemFs } from '../../test/test-utils.js';

const configPath = getConfigPath();

describe('ConfigService', () => {
  describe('loadRaw', () => {
    it('should return empty object when config file does not exist', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.loadRaw();

      expect(config).toEqual({});
    });

    it('should read and parse config file when it exists', () => {
      const configData = {
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
        'session-manager': 'herdr',
      };
      const { fs } = createMemFs({
        [configPath]: JSON.stringify(configData),
      });
      const service = new ConfigService(fs);

      const config = service.loadRaw();

      expect(config).toEqual(configData);
    });

    it('should throw error for invalid config schema', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'session-manager': 'screen',
        }),
      });
      const service = new ConfigService(fs);

      expect(() => service.loadRaw()).toThrow();
    });
  });

  describe('saveRaw', () => {
    it('should create config directory and write config file', () => {
      const { vol, fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = {
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      };

      service.saveRaw(config);

      const written = JSON.parse(vol.readFileSync(configPath, 'utf-8') as string);
      expect(written).toEqual(config);
    });

    it('should validate config before saving', () => {
      const { vol, fs } = createMemFs();
      const service = new ConfigService(fs);

      const invalidConfig = {
        'source-path': '/home/user/repos',
        'session-manager': 'screen' as any,
      };

      expect(() => service.saveRaw(invalidConfig)).toThrow();
      expect(vol.existsSync(configPath)).toBe(false);
    });
  });

  describe('set', () => {
    it('should merge the values into the existing config', () => {
      const { vol, fs } = createMemFs({
        [configPath]: JSON.stringify({ 'source-path': '/repos', 'session-manager': 'none' }),
      });
      const service = new ConfigService(fs);

      service.set({ 'session-manager': 'herdr', 'herdr-prompted': 'true' });

      const written = JSON.parse(vol.readFileSync(configPath, 'utf-8') as string);
      expect(written).toEqual({ 'source-path': '/repos', 'session-manager': 'herdr', 'herdr-prompted': 'true' });
    });
  });

  describe('load', () => {
    it('should return config with defaults when file does not exist', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config).toEqual({
        copyFiles: '.env',
        sessionManager: 'none',
        fetchCacheTtlSeconds: 300,
        postCheckout: undefined,
        perRepoPostCheckout: {},
        repoGroups: {},
        herdrPrompted: false,
      });
    });

    it('should transform raw config to parsed config', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config).toEqual({
        sourcePath: '/home/user/repos',
        destPath: '/home/user/workspaces',
        copyFiles: '.env',
        sessionManager: 'none',
        fetchCacheTtlSeconds: 300,
        postCheckout: undefined,
        perRepoPostCheckout: {},
        repoGroups: {},
        herdrPrompted: false,
      });
    });

    it('should read session-manager', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'session-manager': 'herdr' }),
      });
      const service = new ConfigService(fs);

      expect(service.load().sessionManager).toBe('herdr');
    });

    it('should read whether the herdr prompt has been shown', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'herdr-prompted': 'true' }),
      });
      const service = new ConfigService(fs);

      expect(service.load().herdrPrompted).toBe(true);
    });

    it('should read the legacy tmux true setting as session-manager tmux', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'true' }),
      });
      const service = new ConfigService(fs);

      expect(service.load().sessionManager).toBe('tmux');
    });

    it('should read the legacy tmux false setting as no session manager', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'false' }),
      });
      const service = new ConfigService(fs);

      expect(service.load().sessionManager).toBe('none');
    });

    it('should prefer session-manager over the legacy tmux setting', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'true', 'session-manager': 'herdr' }),
      });
      const service = new ConfigService(fs);

      expect(service.load().sessionManager).toBe('herdr');
    });

    it('should use custom values when provided', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'copy-files': '.env,.env.local',
          'post-checkout': 'npm install',
          'fetch-cache-ttl-seconds': '600',
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.copyFiles).toBe('.env,.env.local');
      expect(config.postCheckout).toBe('npm install');
      expect(config.fetchCacheTtlSeconds).toBe(600);
    });

    it('should load per-repo post-checkout commands', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'per-repo-post-checkout': {
            'repo1': 'npm install && npm run build',
            'repo2': 'yarn install',
          },
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.perRepoPostCheckout).toEqual({
        repo1: 'npm install && npm run build',
        repo2: 'yarn install',
      });
    });

    it('should default to empty object for per-repo post-checkout when not set', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.perRepoPostCheckout).toEqual({});
    });

    it('should load repo groups', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'repo-groups': { backend: ['api-1', 'api-2'], web: ['client'] },
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.repoGroups).toEqual({ backend: ['api-1', 'api-2'], web: ['client'] });
    });

    it('should default to no repo groups when not set', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.repoGroups).toEqual({});
    });

    it('should drop the removed branch-auto-select-repos setting', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'branch-auto-select-repos': 'repo1,repo2' }),
      });
      const service = new ConfigService(fs);

      expect(service.loadRaw()).toEqual({});
    });
  });

  describe('getRequired', () => {
    it('should throw ConfigNotSetError when source-path is missing', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'dest-path': '/home/user/workspaces' }),
      });
      const service = new ConfigService(fs);

      expect(() => service.getRequired()).toThrow(ConfigNotSetError);
    });

    it('should throw ConfigNotSetError when dest-path is missing', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'source-path': '/home/user/repos' }),
      });
      const service = new ConfigService(fs);

      expect(() => service.getRequired()).toThrow(ConfigNotSetError);
    });

    it('should return required config when both paths are set', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
        }),
      });
      const service = new ConfigService(fs);

      const config = service.getRequired();

      expect(config).toEqual({
        sourcePath: '/home/user/repos',
        destPath: '/home/user/workspaces',
      });
    });
  });

  describe('getDisplayConfig', () => {
    it('should return display config with default flags', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['source-path']).toEqual({
        value: '/home/user/repos',
        isDefault: false,
      });
      expect(displayConfig['dest-path']).toEqual({
        value: '/home/user/workspaces',
        isDefault: false,
      });
      expect(displayConfig['copy-files'].isDefault).toBe(true);
      expect(displayConfig['copy-files'].value).toContain('.env');
      expect(displayConfig['session-manager'].isDefault).toBe(true);
      expect(displayConfig['post-checkout'].isDefault).toBe(true);
      expect(displayConfig['fetch-cache-ttl-seconds'].isDefault).toBe(true);
    });

    it('should mark custom values as non-default', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
          'copy-files': '.env,.env.local',
          'session-manager': 'tmux',
          'post-checkout': 'npm install',
          'fetch-cache-ttl-seconds': '600',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['copy-files']).toEqual({
        value: '.env,.env.local',
        isDefault: false,
      });
      expect(displayConfig['session-manager']).toEqual({
        value: 'tmux',
        isDefault: false,
      });
      expect(displayConfig['post-checkout']).toEqual({
        value: 'npm install',
        isDefault: false,
      });
      expect(displayConfig['fetch-cache-ttl-seconds']).toEqual({
        value: '600',
        isDefault: false,
      });
    });

    it('should show (not set) for missing required fields', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['source-path']).toEqual({
        value: '(not set)',
        isDefault: true,
      });
      expect(displayConfig['dest-path']).toEqual({
        value: '(not set)',
        isDefault: true,
      });
    });

    it('should show default values with (default) suffix', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['copy-files'].value).toBe('.env (default)');
      expect(displayConfig['session-manager'].value).toBe('none (default)');
    });

    it('should show a session manager taken from the legacy tmux setting as non-default', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'true' }),
      });
      const service = new ConfigService(fs);

      expect(service.getDisplayConfig()['session-manager']).toEqual({
        value: 'tmux (from legacy tmux setting)',
        isDefault: false,
      });
    });

    it('should handle post-checkout as not set when undefined', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['post-checkout']).toEqual({
        value: '(not set)',
        isDefault: true,
      });
    });

    it('should include per-repo post-checkout commands', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
          'per-repo-post-checkout': {
            'repo1': 'npm install',
            'repo2': 'yarn install',
          },
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig.perRepoPostCheckout).toEqual({
        repo1: 'npm install',
        repo2: 'yarn install',
      });
    });

    it('should include empty object for per-repo post-checkout when not set', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig.perRepoPostCheckout).toEqual({});
    });
  });
});

describe('validateAndTransformConfigValue', () => {
  it('should resolve source-path to absolute path', () => {
    const result = validateAndTransformConfigValue('source-path', '/home/user/repos');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('should resolve dest-path to absolute path', () => {
    const result = validateAndTransformConfigValue('dest-path', '/home/user/workspaces');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('should validate session-manager as enum', () => {
    expect(validateAndTransformConfigValue('session-manager', 'none')).toBe('none');
    expect(validateAndTransformConfigValue('session-manager', 'tmux')).toBe('tmux');
    expect(validateAndTransformConfigValue('session-manager', 'herdr')).toBe('herdr');
    expect(() => validateAndTransformConfigValue('session-manager', 'screen')).toThrow();
  });

  it('should accept valid string values', () => {
    expect(validateAndTransformConfigValue('copy-files', '.env')).toBe('.env');
    expect(validateAndTransformConfigValue('post-checkout', 'npm install')).toBe('npm install');
  });

  it('should validate fetch-cache-ttl-seconds as non-negative integer', () => {
    expect(validateAndTransformConfigValue('fetch-cache-ttl-seconds', '300')).toBe('300');
    expect(validateAndTransformConfigValue('fetch-cache-ttl-seconds', '0')).toBe('0');
    expect(() => validateAndTransformConfigValue('fetch-cache-ttl-seconds', '-1')).toThrow();
    expect(() => validateAndTransformConfigValue('fetch-cache-ttl-seconds', 'abc')).toThrow();
  });
});

describe('isValidKey', () => {
  it('should return true for valid config keys', () => {
    expect(isValidKey('source-path')).toBe(true);
    expect(isValidKey('dest-path')).toBe(true);
    expect(isValidKey('copy-files')).toBe(true);
    expect(isValidKey('session-manager')).toBe(true);
    expect(isValidKey('post-checkout')).toBe(true);
    expect(isValidKey('fetch-cache-ttl-seconds')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidKey('invalid-key')).toBe(false);
    // Superseded by session-manager; still read, but no longer settable
    expect(isValidKey('tmux')).toBe(false);
    // Removed; repo groups replace it
    expect(isValidKey('branch-auto-select-repos')).toBe(false);
    expect(isValidKey('random')).toBe(false);
    expect(isValidKey('')).toBe(false);
  });
});

describe('getConfigPath', () => {
  it('should return config path in .config/flow directory', () => {
    const configPath = getConfigPath();
    expect(configPath).toMatch(/\.config\/flow\/config\.json$/);
  });
});

describe('validateWorkspacePaths', () => {
  it('should accept a dest-path nested inside the source-path', () => {
    expect(() => validateWorkspacePaths('/home/user/dev', '/home/user/dev/.workspaces')).not.toThrow();
  });

  it('should accept a dest-path outside the source-path', () => {
    expect(() => validateWorkspacePaths('/home/user/dev', '/home/user/workspaces')).not.toThrow();
  });

  it('should accept sibling folders that merely share a name prefix', () => {
    expect(() => validateWorkspacePaths('/home/user/dev', '/home/user/dev-workspaces')).not.toThrow();
  });

  it('should reject a dest-path equal to the source-path', () => {
    expect(() => validateWorkspacePaths('/home/user/dev', '/home/user/dev/')).toThrow(InvalidWorkspacePathsError);
  });

  it('should reject a source-path inside the dest-path', () => {
    expect(() => validateWorkspacePaths('/home/user/workspaces/repos', '/home/user/workspaces')).toThrow(
      InvalidWorkspacePathsError
    );
  });
});

describe('defaultDestPath', () => {
  it('should nest a hidden .workspaces folder inside the source-path', () => {
    expect(defaultDestPath('/home/user/dev')).toBe('/home/user/dev/.workspaces');
  });
});
