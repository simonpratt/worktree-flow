import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runPrune } from '../prune.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
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
    await createTestWorkspace(integration.useCases, {
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

  it('should display full workspace status before checkbox prompt', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    checkboxStub.resolves(['old-feature']);

    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Verify status was displayed (logStatus writes header via console.log)
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log: string) => log.includes('Workspaces:'))).toBe(true);
    // Should show per-repo status line (repo name and status message)
    expect(logs.some((log: string) => log.includes('repo1'))).toBe(true);
  });

  it('should prune old workspaces with clean status', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create a workspace
    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;

    expect(fs.existsSync(workspacePath)).toBe(true);

    // User selects the workspace to prune
    checkboxStub.resolves(['old-feature']);

    // Run prune
    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Workspace should be removed
    expect(fs.existsSync(workspacePath)).toBe(false);
  });

  it('should exclude workspace with uncommitted changes from checkbox choices', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create two workspaces
    const dirtyResult = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'dirty-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const cleanResult = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'clean-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Add uncommitted changes to the dirty workspace
    const dirtyWorktree = path.join(dirtyResult.workspacePath, 'repo1');
    fs.writeFileSync(path.join(dirtyWorktree, 'dirty.txt'), 'uncommitted\n');

    // User selects the clean one
    checkboxStub.resolves(['clean-feature']);

    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Verify the skip message was logged for the dirty workspace
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log: string) => log.includes('Skipping') && log.includes('dirty-feature'))).toBe(true);

    // Verify the checkbox was NOT offered the dirty workspace
    const checkboxCall = checkboxStub.getCall(0);
    const choiceValues = checkboxCall.args[0].choices.map((c: any) => c.value);
    expect(choiceValues).not.toContain('dirty-feature');
    expect(choiceValues).toContain('clean-feature');

    // Clean workspace should be removed, dirty should remain
    expect(fs.existsSync(cleanResult.workspacePath)).toBe(false);
    expect(fs.existsSync(dirtyResult.workspacePath)).toBe(true);
  });

  it('should exit when all workspaces have uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'dirty-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Add uncommitted changes
    const worktreePath = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    try {
      await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });
      expect.fail('Should have thrown ProcessExitError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessExitError);
    }

    // Should have logged the skip message and the exit message
    const logs = (integration.stubs.console.log as sinon.SinonStub).getCalls().map((call) => call.args[0]);
    expect(logs.some((log: string) => log.includes('Skipping') && log.includes('dirty-feature'))).toBe(true);
    expect(logs.some((log: string) => log.includes('All workspaces have uncommitted changes or errors'))).toBe(true);

    // Checkbox should NOT have been called
    expect(checkboxStub.called).toBe(false);

    // Workspace should still exist
    expect(fs.existsSync(result.workspacePath)).toBe(true);
  });

  it('should not prune workspace when user declines confirmation', async () => {
    confirmStub.resolves(false);

    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;

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
    const result1 = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature-1',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const result2 = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature-2',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // User selects both workspaces to prune
    checkboxStub.resolves(['old-feature-1', 'old-feature-2']);

    await runPrune(integration.useCases, integration.services, { checkbox: checkboxStub, confirm: confirmStub });

    // Both workspaces should be removed
    expect(fs.existsSync(result1.workspacePath)).toBe(false);
    expect(fs.existsSync(result2.workspacePath)).toBe(false);
  });
});
