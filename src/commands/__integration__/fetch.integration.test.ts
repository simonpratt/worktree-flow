import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runFetch } from '../fetch.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('fetch integration', () => {
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

  it('should fetch all repos used across workspaces when no branch provided', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await createTestWorkspace(integration.useCases, {
      repos: [repo2],
      branchName: 'feature-b',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await runFetch(undefined, integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const completeLine = logCalls.find((line: string) =>
      line.includes('Fetch complete')
    );
    expect(completeLine).toBeDefined();
  });

  it('should handle empty workspaces gracefully when no branch provided', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    await runFetch(undefined, integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    // Should complete without errors even with no workspaces
    const completeLine = logCalls.find((line: string) =>
      line.includes('Fetch complete')
    );
    expect(completeLine).toBeDefined();
  });

  it('should fetch only repos in the specified workspace when branch provided', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await createTestWorkspace(integration.useCases, {
      repos: [repo2],
      branchName: 'feature-b',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await runFetch('feature-a', integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const scopedLine = logCalls.find((line: string) =>
      line.includes('feature-a')
    );
    const completeLine = logCalls.find((line: string) =>
      line.includes('Fetch complete')
    );
    expect(scopedLine).toBeDefined();
    expect(completeLine).toBeDefined();
  });

  it('should fetch workspace repos when cwd is inside a workspace and no branch provided', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const { workspacePath } = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Simulate cwd being inside the workspace
    (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);

    await runFetch(undefined, integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const scopedLine = logCalls.find((line: string) => line.includes('feature-a'));
    const completeLine = logCalls.find((line: string) => line.includes('Fetch complete'));
    expect(scopedLine).toBeDefined();
    expect(completeLine).toBeDefined();
  });
});

