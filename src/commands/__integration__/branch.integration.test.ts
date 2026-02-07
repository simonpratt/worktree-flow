import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runBranch } from '../branch.js';
import { WorkspaceAlreadyExistsError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('branch integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let confirmStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    confirmStub = sinon.stub().resolves(false);
    inputStub = sinon.stub().resolves('master');
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should create worktrees with new branch for selected repos', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const checkboxStub = sinon.stub().resolves([repo1, repo2]);

    await runBranch('new-feature', integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify worktree dirs exist
    const wt1 = path.join(destPath, 'new-feature', 'repo1');
    const wt2 = path.join(destPath, 'new-feature', 'repo2');
    expect(fs.existsSync(wt1)).toBe(true);
    expect(fs.existsSync(wt2)).toBe(true);

    // Verify new branch created in each worktree
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout: branch1 } = await shell.execFile('git', ['-C', wt1, 'branch', '--show-current']);
    const { stdout: branch2 } = await shell.execFile('git', ['-C', wt2, 'branch', '--show-current']);
    expect(branch1.trim()).toBe('new-feature');
    expect(branch2.trim()).toBe('new-feature');
  });

  it('should throw WorkspaceAlreadyExistsError when workspace dir exists', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    // Pre-create the workspace directory
    fs.mkdirSync(path.join(destPath, 'new-feature'), { recursive: true });

    integration = createIntegrationServices(sourcePath, destPath);

    const checkboxStub = sinon.stub().resolves([repo1]);

    await expect(
      runBranch('new-feature', integration.services, {
        checkbox: checkboxStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(WorkspaceAlreadyExistsError);
  });
});
