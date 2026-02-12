import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runPrune } from '../prune.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  ProcessExitError,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('prune integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let confirmStub: sinon.SinonStub;
  let checkboxStub: sinon.SinonStub;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    confirmStub = sinon.stub().resolves(true);
    checkboxStub = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should show message when no workspaces exist', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    // Process.exit throws ProcessExitError in tests
    try {
      await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });
      expect.fail('Should have thrown ProcessExitError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessExitError);
    }

    // Should have logged "No workspaces found"
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log) => log.includes('No workspaces found'))).toBe(true);
  });

  it('should show message when no workspaces are selected', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create a workspace
    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // User selects nothing
    checkboxStub.resolves([]);

    // Process.exit throws ProcessExitError in tests
    try {
      await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });
      expect.fail('Should have thrown ProcessExitError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessExitError);
    }

    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log) => log.includes('No workspaces selected'))).toBe(true);
  });

  it('should prune old workspaces with clean status', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create a workspace
    const result = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;
    const worktreePath = path.join(workspacePath, 'repo1');

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();

    // Add a new commit and update origin/master to point to it
    // This simulates the commit being merged to master
    fs.writeFileSync(path.join(worktreePath, 'test.txt'), 'test content\n');
    await shell.execFile('git', ['-C', worktreePath, 'add', 'test.txt']);

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const gitDate = tenDaysAgo.toISOString();

    await shell.execFile('git', [
      '-C',
      worktreePath,
      '-c',
      `user.name=Test`,
      '-c',
      `user.email=test@example.com`,
      'commit',
      '-m',
      'old commit',
      '--date',
      gitDate,
    ]);

    // Update origin/master to point to the new commit (simulate merge)
    const sha = (await shell.execFile('git', ['-C', worktreePath, 'rev-parse', 'HEAD'])).stdout.trim();
    await shell.execFile('git', ['-C', repo1, 'update-ref', 'refs/remotes/origin/master', sha]);

    expect(fs.existsSync(workspacePath)).toBe(true);

    // User selects the workspace to prune
    checkboxStub.resolves(['old-feature']);

    // Run prune
    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Workspace should be removed
    expect(fs.existsSync(workspacePath)).toBe(false);
  });

  it('should fail to prune workspace with uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;
    const worktreePath = path.join(workspacePath, 'repo1');

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();

    // Add a new commit with an old date
    fs.writeFileSync(path.join(worktreePath, 'test.txt'), 'test content\n');
    await shell.execFile('git', ['-C', worktreePath, 'add', 'test.txt']);

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const gitDate = tenDaysAgo.toISOString();
    await shell.execFile('git', [
      '-C',
      worktreePath,
      '-c',
      `user.name=Test`,
      '-c',
      `user.email=test@example.com`,
      'commit',
      '-m',
      'old commit',
      '--date',
      gitDate,
    ]);

    // Add uncommitted changes
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    // User selects the workspace with uncommitted changes
    checkboxStub.resolves(['old-feature']);

    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Workspace should NOT be removed due to uncommitted changes
    expect(fs.existsSync(workspacePath)).toBe(true);

    // Should log failure message
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log) => log.includes('Failed to remove'))).toBe(true);
  });

  it('should not prune workspace when user declines confirmation', async () => {
    confirmStub.resolves(false);

    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;
    const worktreePath = path.join(workspacePath, 'repo1');

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();

    // Add a new commit with an old date
    fs.writeFileSync(path.join(worktreePath, 'test.txt'), 'test content\n');
    await shell.execFile('git', ['-C', worktreePath, 'add', 'test.txt']);

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const gitDate = tenDaysAgo.toISOString();
    await shell.execFile('git', [
      '-C',
      worktreePath,
      '-c',
      `user.name=Test`,
      '-c',
      `user.email=test@example.com`,
      'commit',
      '-m',
      'old commit',
      '--date',
      gitDate,
    ]);

    // User selects the workspace but declines confirmation
    checkboxStub.resolves(['old-feature']);

    // Process.exit throws ProcessExitError in tests to simulate stopping execution
    try {
      await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });
      expect.fail('Should have thrown ProcessExitError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessExitError);
      expect((error as ProcessExitError).code).toBe(0);
    }

    // Workspace should NOT be removed
    expect(fs.existsSync(workspacePath)).toBe(true);

    // Should log "Cancelled"
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log) => log.includes('Cancelled'))).toBe(true);
  });

  it('should prune multiple old workspaces', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create two old workspaces
    const result1 = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'old-feature-1',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const result2 = await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'old-feature-2',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const gitDate = tenDaysAgo.toISOString();

    // Make commits old for both workspaces
    for (const result of [result1, result2]) {
      const worktreePath = path.join(result.workspacePath, 'repo1');

      // Add a new commit with an old date
      fs.writeFileSync(path.join(worktreePath, 'test.txt'), 'test content\n');
      await shell.execFile('git', ['-C', worktreePath, 'add', 'test.txt']);
      await shell.execFile('git', [
        '-C',
        worktreePath,
        '-c',
        `user.name=Test`,
        '-c',
        `user.email=test@example.com`,
        'commit',
        '-m',
        'old commit',
        '--date',
        gitDate,
      ]);

      // Update origin/master to point to the new commit (simulate merge)
      const sha = (await shell.execFile('git', ['-C', worktreePath, 'rev-parse', 'HEAD'])).stdout.trim();
      await shell.execFile('git', ['-C', repo1, 'update-ref', 'refs/remotes/origin/master', sha]);
    }

    // User selects both workspaces to prune
    checkboxStub.resolves(['old-feature-1', 'old-feature-2']);

    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Both workspaces should be removed
    expect(fs.existsSync(result1.workspacePath)).toBe(false);
    expect(fs.existsSync(result2.workspacePath)).toBe(false);
  });
});
