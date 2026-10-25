import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runGroupSet, runGroupList, runGroupRemove } from '../group.js';
import { ConfigService, getConfigPath } from '../../lib/config.js';
import { RepoNotFoundError, RepoGroupNotFoundError } from '../../lib/errors.js';
import { createMemFs } from '../../test/test-utils.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('group integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let readStoredConfig: () => Record<string, unknown>;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    await initGitRepo(sourcePath, 'api-1');
    await initGitRepo(sourcePath, 'api-2');
    await initGitRepo(sourcePath, 'client');

    integration = createIntegrationServices(sourcePath, destPath);

    // Use the real config service over an in-memory config file, so groups round-trip through it
    const { vol, fs: memFs } = createMemFs({
      [getConfigPath()]: JSON.stringify({ 'source-path': sourcePath, 'dest-path': destPath }),
    });
    integration.services.config = new ConfigService(memFs);
    readStoredConfig = () => JSON.parse(vol.readFileSync(getConfigPath(), 'utf-8') as string);
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  function logged(): string[] {
    // Without ANSI colour codes, so lines can be compared exactly
    return (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0].replace(/\x1b\[[0-9;]*m/g, ''));
  }

  describe('set', () => {
    it('should save the group, keeping the rest of the config', () => {
      runGroupSet('backend', ['api-1', 'api-2'], integration.services);

      expect(readStoredConfig()).toEqual({
        'source-path': sourcePath,
        'dest-path': destPath,
        'repo-groups': { backend: ['api-1', 'api-2'] },
      });
    });

    it('should replace the members of an existing group and leave other groups alone', () => {
      runGroupSet('backend', ['api-1', 'api-2'], integration.services);
      runGroupSet('web', ['client'], integration.services);

      runGroupSet('backend', ['api-2'], integration.services);

      expect(integration.services.config.load().repoGroups).toEqual({ backend: ['api-2'], web: ['client'] });
    });

    it('should store each repo once when it is listed twice', () => {
      runGroupSet('backend', ['api-1', 'api-1'], integration.services);

      expect(integration.services.config.load().repoGroups).toEqual({ backend: ['api-1'] });
    });

    it('should reject a repo that is not in the source-path without saving', () => {
      expect(() => runGroupSet('backend', ['api-1', 'worker'], integration.services)).toThrow(RepoNotFoundError);

      expect(integration.services.config.load().repoGroups).toEqual({});
    });

    it('should reject a group name that is not usable as a single CLI argument', () => {
      expect(() => runGroupSet('back end', ['api-1'], integration.services)).toThrow(/Invalid group name/);

      expect(integration.services.config.load().repoGroups).toEqual({});
    });
  });

  describe('list', () => {
    it('should list each group with its members, alphabetically', () => {
      runGroupSet('web', ['client'], integration.services);
      runGroupSet('backend', ['api-1', 'api-2'], integration.services);

      runGroupList(integration.services);

      const groupLines = logged().filter((line) => line.startsWith('  '));
      expect(groupLines).toEqual(['  backend: api-1, api-2', '  web: client']);
    });

    it('should flag members that are no longer in the source-path', () => {
      runGroupSet('backend', ['api-1', 'api-2'], integration.services);
      fs.rmSync(path.join(sourcePath, 'api-2'), { recursive: true, force: true });

      runGroupList(integration.services);

      expect(logged()).toContain('  backend: api-1, api-2 (missing)');
    });

    it('should explain how to create a group when there are none', () => {
      runGroupList(integration.services);

      expect(logged().some((line) => line.includes('flow group set <name> <repo...>'))).toBe(true);
    });
  });

  describe('rm', () => {
    it('should remove the group and leave other groups alone', () => {
      runGroupSet('backend', ['api-1'], integration.services);
      runGroupSet('web', ['client'], integration.services);

      runGroupRemove('backend', integration.services);

      expect(integration.services.config.load().repoGroups).toEqual({ web: ['client'] });
    });

    it('should throw RepoGroupNotFoundError when the group does not exist', () => {
      runGroupSet('web', ['client'], integration.services);

      expect(() => runGroupRemove('backend', integration.services)).toThrow(RepoGroupNotFoundError);
    });
  });
});
