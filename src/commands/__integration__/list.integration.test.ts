import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runList } from '../list.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('list integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should log "No workspaces found." when dest is empty', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    await runList(integration.services);

    sinon.assert.calledWith(integration.stubs.console.log as any, 'No workspaces found.');
  });

  it('should list workspaces with repo counts', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1, repo2],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await runList(integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const workspaceLine = logCalls.find((line: string) => line.includes('feature-a'));
    expect(workspaceLine).toBeDefined();
    expect(workspaceLine).toContain('2 repos');
  });

  it('should list multiple workspaces', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo2],
      branchName: 'feature-b',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await runList(integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const featureA = logCalls.find((line: string) => line.includes('feature-a'));
    const featureB = logCalls.find((line: string) => line.includes('feature-b'));
    expect(featureA).toBeDefined();
    expect(featureB).toBeDefined();
  });
});
