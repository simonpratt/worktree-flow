import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runStatus } from '../status.js';
import { WorkspaceNotFoundError, NotInWorkspaceError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('status integration', () => {
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

  it('should throw WorkspaceNotFoundError for nonexistent workspace', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    await expect(
      runStatus('nonexistent', integration.services)
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should throw NotInWorkspaceError when auto-detecting and cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    await expect(runStatus(undefined, integration.services)).rejects.toThrow(NotInWorkspaceError);
  });

  it('should show clean status for repos with no changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    await runStatus('feature', integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Summary:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 up to date');
    expect(summaryLine).toContain('0 with issues');
  });

  it('should show issues for repos with uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Add an uncommitted file in the worktree
    const worktreePath = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    await runStatus('feature', integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Summary:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 with issues');
  });

  it('should show multiple repos with mixed status', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1, repo2],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Make repo1 dirty, leave repo2 clean
    const wt1 = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(wt1, 'dirty.txt'), 'uncommitted\n');

    await runStatus('feature', integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Summary:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 up to date');
    expect(summaryLine).toContain('1 with issues');
  });

  it('should auto-detect workspace when no branch provided and cwd is inside workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Set cwd to inside the workspace
    (integration.stubs.process.cwd as sinon.SinonStub).returns(result.workspacePath);

    await runStatus(undefined, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Summary:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 up to date');
  });

  it('should auto-detect workspace when no branch provided and cwd is inside a repo subdirectory', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Set cwd to inside a repo within the workspace
    const repoCwd = path.join(result.workspacePath, 'repo1');
    (integration.stubs.process.cwd as sinon.SinonStub).returns(repoCwd);

    await runStatus(undefined, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Summary:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 up to date');
  });
});
