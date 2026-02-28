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
  createTestWorkspace,
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
      runStatus('nonexistent', integration.useCases, integration.services)
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should throw NotInWorkspaceError when auto-detecting and cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    await expect(runStatus(undefined, integration.useCases, integration.services)).rejects.toThrow(NotInWorkspaceError);
  });

  it('should show clean status for repos with no changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await runStatus('feature', integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );

    const workspaceHeader = logCalls.find((line: string) => line.includes('Workspace:'));
    expect(workspaceHeader).toBeDefined();

    const workspaceLine = logCalls.find((line: string) => line.includes('feature'));
    expect(workspaceLine).toBeDefined();

    // Repo line should match list command format: indicator, repo name, status, tracking info
    // formatRepoStatusLine produces lines starting with 4 spaces
    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toBeDefined();
    expect(repoLine).toMatch(/✓/);
    expect(repoLine).toContain('up to date');
    expect(repoLine).toMatch(/→|no upstream/);
  });

  it('should show issues for repos with uncommitted changes', async () => {
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

    // Add an uncommitted file in the worktree
    const worktreePath = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    await runStatus('feature', integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );

    // Repo line should match list command format with error indicator
    // formatRepoStatusLine produces lines starting with 4 spaces
    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toBeDefined();
    expect(repoLine).toMatch(/✗/);
    expect(repoLine).toContain('uncommitted');
  });

  it('should show multiple repos with mixed status', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await createTestWorkspace(integration.useCases, {
      repos: [repo1, repo2],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Make repo1 dirty, leave repo2 clean
    const wt1 = path.join(result.workspacePath, 'repo1');
    fs.writeFileSync(path.join(wt1, 'dirty.txt'), 'uncommitted\n');

    await runStatus('feature', integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );

    const cleanRepoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo2')
    );
    expect(cleanRepoLine).toMatch(/✓/);

    const dirtyRepoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(dirtyRepoLine).toMatch(/✗/);
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

    await runStatus(undefined, integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const workspaceLine = logCalls.find((line: string) => line.includes('feature'));
    expect(workspaceLine).toBeDefined();

    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toMatch(/✓/);
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

    await runStatus(undefined, integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const workspaceLine = logCalls.find((line: string) => line.includes('feature'));
    expect(workspaceLine).toBeDefined();

    const repoLine = logCalls.find(
      (line: string) => typeof line === 'string' && line.startsWith('    ') && line.includes('repo1')
    );
    expect(repoLine).toMatch(/✓/);
  });
});
