import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runDrop } from '../drop.js';
import { WorkspaceHasIssuesError, NotInWorkspaceError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  ProcessExitError,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('drop integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let confirmStub: sinon.SinonStub;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    confirmStub = sinon.stub().resolves(true);
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should throw NotInWorkspaceError when auto-detecting and cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    await expect(
      runDrop(undefined, integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow(NotInWorkspaceError);
  });

  it('should drop workspace and worktrees on happy path', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    // Create a workspace with a worktree via createTestWorkspace
    integration = createIntegrationServices(sourcePath, destPath);
    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;
    const worktreePath = path.join(workspacePath, 'repo1');
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Now drop the workspace
    await runDrop('feature', integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace directory should be gone
    expect(fs.existsSync(workspacePath)).toBe(false);

    // Worktree should be cleaned up from git
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout } = await shell.execFile('git', ['-C', repo1, 'worktree', 'list']);
    expect(stdout).not.toContain('feature');

    // Status output should use the same format as `flow status`
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const workspaceHeader = logCalls.find((line: string) => line.includes('Workspace:'));
    expect(workspaceHeader).toBeDefined();

    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toBeDefined();
    expect(repoLine).toMatch(/✓/);
    expect(repoLine).toContain('up to date');
  });

  it('should throw WorkspaceHasIssuesError when worktree has uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const worktreePath = path.join(result.workspacePath, 'repo1');

    // Add an uncommitted file in the worktree
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    await expect(
      runDrop('feature', integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow(WorkspaceHasIssuesError);

    // Workspace should still exist (not removed)
    expect(fs.existsSync(result.workspacePath)).toBe(true);

    // Confirmation prompt should never have been shown
    expect(confirmStub.called).toBe(false);

    // Status output should show the issue in the same format as `flow status`
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toBeDefined();
    expect(repoLine).toMatch(/✗/);
    expect(repoLine).toContain('uncommitted');
  });

  it('should auto-detect workspace when no branch provided and cwd is inside workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Set cwd to inside the workspace
    (integration.stubs.process.cwd as sinon.SinonStub).returns(result.workspacePath);

    await runDrop(undefined, integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace directory should be gone
    expect(fs.existsSync(result.workspacePath)).toBe(false);

    // Worktree should be cleaned up from git
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout } = await shell.execFile('git', ['-C', repo1, 'worktree', 'list']);
    expect(stdout).not.toContain('feature');
  });

  it('should auto-detect workspace when no branch provided and cwd is inside a repo subdirectory', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Set cwd to inside a repo within the workspace
    const repoCwd = path.join(result.workspacePath, 'repo1');
    (integration.stubs.process.cwd as sinon.SinonStub).returns(repoCwd);

    await runDrop(undefined, integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace directory should be gone
    expect(fs.existsSync(result.workspacePath)).toBe(false);
  });

  it('should allow dropping when worktree has commits ahead of base branch (but no uncommitted changes)', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const worktreePath = path.join(result.workspacePath, 'repo1');

    // Add a committed change in the worktree (ahead of master)
    fs.writeFileSync(path.join(worktreePath, 'new-feature.txt'), 'committed change\n');
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    await shell.execFile('git', ['-C', worktreePath, 'add', 'new-feature.txt']);
    await shell.execFile('git', ['-C', worktreePath, 'commit', '-m', 'Add new feature']);

    // Should NOT throw - committed changes are safe
    await runDrop('feature', integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace should be removed
    expect(fs.existsSync(result.workspacePath)).toBe(false);

    // Status should have shown ahead indicator (not an issue, so checkmark)
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toBeDefined();
    expect(repoLine).toMatch(/✓/);
  });

  it('should not drop workspace when user declines confirmation', async () => {
    confirmStub.resolves(false);

    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const workspacePath = result.workspacePath;

    // Process.exit throws ProcessExitError in tests to simulate stopping execution
    try {
      await runDrop('feature', integration.useCases, integration.services, { confirm: confirmStub });
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
});
