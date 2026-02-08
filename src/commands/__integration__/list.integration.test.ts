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
    await runList(integration.useCases, integration.services);

    sinon.assert.calledWith(integration.stubs.console.log as any, 'No workspaces found.');
  });

  it('should list workspaces with repo counts and status', async () => {
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

    await runList(integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    // Filter out intermediate "fetching..." lines
    const workspaceLine = logCalls.find(
      (line: string) => line.includes('feature-a') && !line.includes('fetching...')
    );
    expect(workspaceLine).toBeDefined();
    expect(workspaceLine).toContain('2 repos');
    expect(workspaceLine).toMatch(/clean|up to date/i);
  });

  it('should show dirty status for workspace with uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Add uncommitted changes
    const worktreePath = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    await runList(integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    // Filter out intermediate "fetching..." lines
    const workspaceLine = logCalls.find(
      (line: string) => line.includes('feature-a') && !line.includes('fetching...')
    );
    expect(workspaceLine).toBeDefined();
    expect(workspaceLine).toMatch(/uncommitted|dirty/i);
  });

  it('should show active indicator for workspace containing current directory', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Set cwd to inside the workspace
    (integration.stubs.process.cwd as sinon.SinonStub).returns(result.workspacePath);

    await runList(integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    // Filter out intermediate "fetching..." lines
    const workspaceLine = logCalls.find(
      (line: string) => line.includes('feature-a') && !line.includes('fetching...')
    );
    expect(workspaceLine).toBeDefined();
    expect(workspaceLine).toMatch(/active|\*/);
  });

  it('should list multiple workspaces with mixed status', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const resultA = await integration.useCases.createBranchWorkspace.execute({
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

    // Make feature-a dirty
    const wt1 = path.join(resultA.workspacePath, 'repo1');
    fs.writeFileSync(path.join(wt1, 'dirty.txt'), 'uncommitted\n');

    await runList(integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    // Filter out intermediate "fetching..." lines
    const featureA = logCalls.find(
      (line: string) => line.includes('feature-a') && !line.includes('fetching...')
    );
    const featureB = logCalls.find(
      (line: string) => line.includes('feature-b') && !line.includes('fetching...')
    );
    expect(featureA).toBeDefined();
    expect(featureB).toBeDefined();
    expect(featureA).toMatch(/uncommitted|dirty/i);
    expect(featureB).toMatch(/clean|up to date/i);
  });
});
