import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import path from 'node:path';
import { ConfigService, validateAndTransformConfigValue, isValidKey, getConfigPath } from './config.js';
import { ConfigNotSetError } from './errors.js';
import { createMockFileSystem } from './test-utils.js';

describe('ConfigService', () => {
  let fs: sinon.SinonStubbedInstance<any>;
  let service: ConfigService;

  beforeEach(() => {
    fs = createMockFileSystem();
    service = new ConfigService(fs as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('loadRaw', () => {
    it('should return empty object when config file does not exist', () => {
      fs.existsSync.returns(false);

      const config = service.loadRaw();

      const configPath = getConfigPath();
      sinon.assert.calledOnceWithExactly(fs.existsSync, configPath);
      expect(config).toEqual({});
    });

    it('should read and parse config file when it exists', () => {
      const configPath = getConfigPath();
      const configData = {
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
        'tmux': 'true',
      };

      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify(configData));

      const config = service.loadRaw();

      sinon.assert.calledOnceWithExactly(fs.existsSync, configPath);
      sinon.assert.calledOnceWithExactly(fs.readFileSync, configPath, 'utf-8');
      expect(config).toEqual(configData);
    });

    it('should throw error for invalid config schema', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'tmux': 'invalid',
      }));

      expect(() => service.loadRaw()).toThrow();
    });
  });

  describe('saveRaw', () => {
    it('should create config directory and write config file', () => {
      const config = {
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      };

      service.saveRaw(config);

      const configPath = getConfigPath();
      const configDir = path.dirname(configPath);

      sinon.assert.calledOnceWithExactly(fs.mkdirSync, configDir, { recursive: true });
      sinon.assert.calledOnce(fs.writeFileSync);

      const writeCall = fs.writeFileSync.firstCall;
      expect(writeCall.args[0]).toBe(configPath);
      expect(JSON.parse(writeCall.args[1])).toEqual(config);
    });

    it('should validate config before saving', () => {
      const invalidConfig = {
        'source-path': '/home/user/repos',
        'tmux': 'invalid' as any,
      };

      expect(() => service.saveRaw(invalidConfig)).toThrow();
      sinon.assert.notCalled(fs.writeFileSync);
    });
  });

  describe('load', () => {
    it('should return config with defaults when file does not exist', () => {
      fs.existsSync.returns(false);

      const config = service.load();

      expect(config).toEqual({
        copyFiles: '.env',
        tmux: false,
        mainBranch: 'master',
      });
    });

    it('should transform raw config to parsed config', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      }));

      const config = service.load();

      expect(config).toEqual({
        sourcePath: '/home/user/repos',
        destPath: '/home/user/workspaces',
        copyFiles: '.env',
        tmux: false,
        mainBranch: 'master',
      });
    });

    it('should convert tmux string to boolean', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'tmux': 'true',
      }));

      const config = service.load();

      expect(config.tmux).toBe(true);
    });

    it('should use custom values when provided', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'main-branch': 'main',
        'copy-files': '.env,.env.local',
        'post-checkout': 'npm install',
      }));

      const config = service.load();

      expect(config.mainBranch).toBe('main');
      expect(config.copyFiles).toBe('.env,.env.local');
      expect(config.postCheckout).toBe('npm install');
    });
  });

  describe('getRequired', () => {
    it('should throw ConfigNotSetError when source-path is missing', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'dest-path': '/home/user/workspaces',
      }));

      expect(() => service.getRequired()).toThrow(ConfigNotSetError);
    });

    it('should throw ConfigNotSetError when dest-path is missing', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
      }));

      expect(() => service.getRequired()).toThrow(ConfigNotSetError);
    });

    it('should return required config when both paths are set', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      }));

      const config = service.getRequired();

      expect(config).toEqual({
        sourcePath: '/home/user/repos',
        destPath: '/home/user/workspaces',
      });
    });
  });

  describe('getDisplayConfig', () => {
    it('should return display config with default flags', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      }));

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
      expect(displayConfig['main-branch'].isDefault).toBe(true);
      expect(displayConfig['post-checkout'].isDefault).toBe(true);
    });

    it('should mark custom values as non-default', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
        'copy-files': '.env,.env.local',
        'tmux': 'true',
        'main-branch': 'main',
        'post-checkout': 'npm install',
      }));

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['copy-files']).toEqual({
        value: '.env,.env.local',
        isDefault: false,
      });
      expect(displayConfig.tmux).toEqual({
        value: 'true',
        isDefault: false,
      });
      expect(displayConfig['main-branch']).toEqual({
        value: 'main',
        isDefault: false,
      });
      expect(displayConfig['post-checkout']).toEqual({
        value: 'npm install',
        isDefault: false,
      });
    });

    it('should show (not set) for missing required fields', () => {
      fs.existsSync.returns(false);

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
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
      }));

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['copy-files'].value).toBe('.env (default)');
      expect(displayConfig.tmux.value).toBe('false (default)');
      expect(displayConfig['main-branch'].value).toBe('master (default)');
    });

    it('should handle post-checkout as not set when undefined', () => {
      fs.existsSync.returns(true);
      fs.readFileSync.returns(JSON.stringify({
        'source-path': '/home/user/repos',
        'dest-path': '/home/user/workspaces',
      }));

      const displayConfig = service.getDisplayConfig();

      expect(displayConfig['post-checkout']).toEqual({
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
    expect(validateAndTransformConfigValue('main-branch', 'main')).toBe('main');
    expect(validateAndTransformConfigValue('post-checkout', 'npm install')).toBe('npm install');
  });
});

describe('isValidKey', () => {
  it('should return true for valid config keys', () => {
    expect(isValidKey('source-path')).toBe(true);
    expect(isValidKey('dest-path')).toBe(true);
    expect(isValidKey('copy-files')).toBe(true);
    expect(isValidKey('tmux')).toBe(true);
    expect(isValidKey('main-branch')).toBe(true);
    expect(isValidKey('post-checkout')).toBe(true);
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
