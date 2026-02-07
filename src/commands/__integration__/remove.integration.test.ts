import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runRemove } from '../remove.js';
import { WorkspaceHasIssuesError } from '../../lib/errors.js';
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

  it('should remove workspace and worktrees on happy path', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    // Create a workspace with a worktree via createBranchWorktrees
    integration = createIntegrationServices(sourcePath, destPath);
    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    const workspacePath = result.workspacePath;
    const worktreePath = path.join(workspacePath, 'repo1');
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Now remove the workspace
    await runRemove('feature', integration.services, { confirm: confirmStub });

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
    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    const worktreePath = path.join(result.workspacePath, 'repo1');

    // Add an uncommitted file in the worktree
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    await expect(
      runRemove('feature', integration.services, { confirm: confirmStub })
    ).rejects.toThrow(WorkspaceHasIssuesError);

    // Workspace should still exist (not removed)
    expect(fs.existsSync(result.workspacePath)).toBe(true);
  });
});
