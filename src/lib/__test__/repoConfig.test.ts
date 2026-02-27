import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { RepoConfigService } from '../repoConfig.js';
import { createMemFs } from '../../test/test-utils.js';

describe('RepoConfigService', () => {
  describe('load', () => {
    it('should return undefined when flow-config.json does not exist', () => {
      const { fs } = createMemFs({
        '/source/repo1/README.md': '# repo1',
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toBeUndefined();
    });

    it('should load copy-files from flow-config.json', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: JSON.stringify({
          'copy-files': '.env,.env.local',
        }),
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toEqual({
        copyFiles: '.env,.env.local',
        postCheckout: undefined,
      });
    });

    it('should load post-checkout from flow-config.json', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: JSON.stringify({
          'post-checkout': 'npm install',
        }),
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toEqual({
        copyFiles: undefined,
        postCheckout: 'npm install',
      });
    });

    it('should load both copy-files and post-checkout', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: JSON.stringify({
          'copy-files': '.env,.env.local,.env.test',
          'post-checkout': 'yarn install && yarn build',
        }),
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toEqual({
        copyFiles: '.env,.env.local,.env.test',
        postCheckout: 'yarn install && yarn build',
      });
    });

    it('should return undefined for empty config object', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: JSON.stringify({}),
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toBeUndefined();
    });

    it('should ignore unknown fields in flow-config.json', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: JSON.stringify({
          'copy-files': '.env',
          'unknown-field': 'value',
        }),
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toEqual({
        copyFiles: '.env',
        postCheckout: undefined,
      });
    });

    it('should return undefined when flow-config.json contains invalid JSON', () => {
      const { fs } = createMemFs({
        [path.join('/source/repo1', 'flow-config.json')]: 'not valid json',
      });

      const service = new RepoConfigService(fs);
      const config = service.load('/source/repo1');

      expect(config).toBeUndefined();
    });
  });

  describe('resolvePostCheckout', () => {
    it('should use per-repo-post-checkout from central config (highest priority)', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolvePostCheckout(
        'repo1',
        { repo1: 'central-per-repo-cmd' },
        { copyFiles: undefined, postCheckout: 'repo-level-cmd' },
        'global-cmd'
      );

      expect(result).toBe('central-per-repo-cmd');
    });

    it('should fall back to repo-level post-checkout when no central per-repo config', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolvePostCheckout(
        'repo1',
        {},
        { copyFiles: undefined, postCheckout: 'repo-level-cmd' },
        'global-cmd'
      );

      expect(result).toBe('repo-level-cmd');
    });

    it('should fall back to global post-checkout when no per-repo or repo-level config', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolvePostCheckout(
        'repo1',
        {},
        undefined,
        'global-cmd'
      );

      expect(result).toBe('global-cmd');
    });

    it('should return undefined when no post-checkout configured at any level', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolvePostCheckout(
        'repo1',
        {},
        undefined,
        undefined
      );

      expect(result).toBeUndefined();
    });

    it('should skip repo-level config when it has no post-checkout', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolvePostCheckout(
        'repo1',
        {},
        { copyFiles: '.env', postCheckout: undefined },
        'global-cmd'
      );

      expect(result).toBe('global-cmd');
    });
  });

  describe('resolveCopyFiles', () => {
    it('should use repo-level copy-files when defined', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolveCopyFiles(
        { copyFiles: '.env,.env.local', postCheckout: undefined },
        '.env'
      );

      expect(result).toBe('.env,.env.local');
    });

    it('should fall back to global copy-files when no repo-level config', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolveCopyFiles(undefined, '.env');

      expect(result).toBe('.env');
    });

    it('should fall back to global when repo config has no copy-files', () => {
      const { fs } = createMemFs();
      const service = new RepoConfigService(fs);

      const result = service.resolveCopyFiles(
        { copyFiles: undefined, postCheckout: 'npm install' },
        '.env'
      );

      expect(result).toBe('.env');
    });
  });
});
