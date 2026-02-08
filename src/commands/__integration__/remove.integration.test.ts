import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runRemove } from '../remove.js';
import { WorkspaceHasIssuesError, NotInWorkspaceError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('remove integration', () => {
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
      runRemove(undefined, integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow(NotInWorkspaceError);
  });

  it('should remove workspace and worktrees on happy path', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    // Create a workspace with a worktree via createBranchWorktrees
    integration = createIntegrationServices(sourcePath, destPath);
    const result = await integration.useCases.createBranchWorkspace.execute({
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

    // Now remove the workspace
    await runRemove('feature', integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace directory should be gone
    expect(fs.existsSync(workspacePath)).toBe(false);

    // Worktree should be cleaned up from git
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout } = await shell.execFile('git', ['-C', repo1, 'worktree', 'list']);
    expect(stdout).not.toContain('feature');
  });

  it('should throw WorkspaceHasIssuesError when worktree has uncommitted changes', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const result = await integration.useCases.createBranchWorkspace.execute({
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
      runRemove('feature', integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow(WorkspaceHasIssuesError);

    // Workspace should still exist (not removed)
    expect(fs.existsSync(result.workspacePath)).toBe(true);
  });

  it('should auto-detect workspace when no branch provided and cwd is inside workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.useCases.createBranchWorkspace.execute({
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

    await runRemove(undefined, integration.useCases, integration.services, { confirm: confirmStub });

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

    const result = await integration.useCases.createBranchWorkspace.execute({
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

    await runRemove(undefined, integration.useCases, integration.services, { confirm: confirmStub });

    // Workspace directory should be gone
    expect(fs.existsSync(result.workspacePath)).toBe(false);
  });
});
