import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ConfigService, validateAndTransformConfigValue, isValidKey, getConfigPath } from '../config.js';
import { ConfigNotSetError } from '../errors.js';
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
        'tmux': 'true',
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
          'tmux': 'invalid',
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
        'tmux': 'invalid' as any,
      };

      expect(() => service.saveRaw(invalidConfig)).toThrow();
      expect(vol.existsSync(configPath)).toBe(false);
    });
  });

  describe('load', () => {
    it('should return config with defaults when file does not exist', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config).toEqual({
        copyFiles: '.env',
        tmux: false,
        fetchCacheTtlSeconds: 300,
        postCheckout: undefined,
        perRepoPostCheckout: {},
        branchAutoSelectRepos: [],
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
        tmux: false,
        fetchCacheTtlSeconds: 300,
        postCheckout: undefined,
        perRepoPostCheckout: {},
        branchAutoSelectRepos: [],
      });
    });

    it('should convert tmux true string to boolean true', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'true' }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.tmux).toBe(true);
    });

    it('should convert tmux false string to boolean false', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({ 'tmux': 'false' }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.tmux).toBe(false);
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

    it('should parse branch-auto-select-repos as array from comma-separated string', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'branch-auto-select-repos': 'repo1,repo2,repo3',
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.branchAutoSelectRepos).toEqual(['repo1', 'repo2', 'repo3']);
    });

    it('should default to empty array for branch-auto-select-repos when not set', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.branchAutoSelectRepos).toEqual([]);
    });

    it('should trim whitespace from branch-auto-select-repos entries', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'branch-auto-select-repos': 'repo1, repo2 , repo3',
        }),
      });
      const service = new ConfigService(fs);

      const config = service.load();

      expect(config.branchAutoSelectRepos).toEqual(['repo1', 'repo2', 'repo3']);
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
      expect(displayConfig.tmux.isDefault).toBe(true);
      expect(displayConfig['post-checkout'].isDefault).toBe(true);
      expect(displayConfig['fetch-cache-ttl-seconds'].isDefault).toBe(true);
    });

    it('should mark custom values as non-default', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'source-path': '/home/user/repos',
          'dest-path': '/home/user/workspaces',
          'copy-files': '.env,.env.local',
          'tmux': 'true',
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
      expect(displayConfig.tmux).toEqual({
        value: 'true',
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
      expect(displayConfig.tmux.value).toBe('false (default)');
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

    it('should show branch-auto-select-repos value when set', () => {
      const { fs } = createMemFs({
        [configPath]: JSON.stringify({
          'branch-auto-select-repos': 'repo1,repo2',
        }),
      });
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['branch-auto-select-repos']).toEqual({
        value: 'repo1,repo2',
        isDefault: false,
      });
    });

    it('should show (not set) for branch-auto-select-repos when not configured', () => {
      const { fs } = createMemFs();
      const service = new ConfigService(fs);

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['branch-auto-select-repos']).toEqual({
        value: '(not set)',
        isDefault: true,
      });
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

  it('should validate tmux as enum', () => {
    expect(validateAndTransformConfigValue('tmux', 'true')).toBe('true');
    expect(validateAndTransformConfigValue('tmux', 'false')).toBe('false');
    expect(() => validateAndTransformConfigValue('tmux', 'invalid' as any)).toThrow();
  });

  it('should accept valid string values', () => {
    expect(validateAndTransformConfigValue('copy-files', '.env')).toBe('.env');
    expect(validateAndTransformConfigValue('post-checkout', 'npm install')).toBe('npm install');
    expect(validateAndTransformConfigValue('branch-auto-select-repos', 'repo1,repo2')).toBe('repo1,repo2');
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
    expect(isValidKey('tmux')).toBe(true);
    expect(isValidKey('post-checkout')).toBe(true);
    expect(isValidKey('fetch-cache-ttl-seconds')).toBe(true);
    expect(isValidKey('branch-auto-select-repos')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidKey('invalid-key')).toBe(false);
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
