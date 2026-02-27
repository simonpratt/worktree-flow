import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runAdd } from '../add.js';
import { NotInWorkspaceError, WorkspaceNotFoundError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('add integration', () => {
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

  it('should throw NotInWorkspaceError when cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    const checkboxStub = sinon.stub().resolves([]);

    await expect(
      runAdd(undefined, integration.useCases, integration.services, {
        checkbox: checkboxStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(NotInWorkspaceError);
  });

  it('should throw WorkspaceNotFoundError when explicit branch does not exist', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    const checkboxStub = sinon.stub().resolves([]);

    await expect(
      runAdd('nonexistent', integration.useCases, integration.services, {
        checkbox: checkboxStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should add new repos to an existing workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // First create a workspace with repo1 only
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runBranch } = await import('../branch.js');
    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify only repo1 exists initially
    const workspacePath = path.join(destPath, 'feature');
    expect(fs.existsSync(path.join(workspacePath, 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(false);

    // Now add repo2 and repo3 via the add command
    const addCheckboxStub = sinon.stub().resolves([repo2, repo3]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);

    await runAdd(undefined, integration.useCases, integration.services, {
      checkbox: addCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify all repos exist
    expect(fs.existsSync(path.join(workspacePath, 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo3'))).toBe(true);

    // Verify correct branch in the added worktrees
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout: branch2 } = await shell.execFile('git', ['-C', path.join(workspacePath, 'repo2'), 'branch', '--show-current']);
    const { stdout: branch3 } = await shell.execFile('git', ['-C', path.join(workspacePath, 'repo3'), 'branch', '--show-current']);
    expect(branch2.trim()).toBe('feature');
    expect(branch3.trim()).toBe('feature');
  });

  it('should use explicit branch name to resolve workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runBranch } = await import('../branch.js');
    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Add repo2 using explicit branch name (cwd doesn't matter)
    const addCheckboxStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/somewhere-else');

    await runAdd('feature', integration.useCases, integration.services, {
      checkbox: addCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const workspacePath = path.join(destPath, 'feature');
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(true);
  });

  it('should exclude repos already in the workspace from the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runBranch } = await import('../branch.js');
    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Run add - checkbox should only show repo2
    const addCheckboxStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAdd(undefined, integration.useCases, integration.services, {
      checkbox: addCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify checkbox choices only contained repo2
    const choices = addCheckboxStub.firstCall.args[0].choices;
    const repoNames = choices.filter((c: any) => c.name !== undefined).map((c: any) => c.name);
    expect(repoNames).toEqual(['repo2']);
    expect(repoNames).not.toContain('repo1');
  });

  it('should do nothing when no repos are selected', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runBranch } = await import('../branch.js');
    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Run add but select nothing (repo2 is available but not selected)
    const addCheckboxStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAdd(undefined, integration.useCases, integration.services, {
      checkbox: addCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    expect(logCalls.some((line: string) => line.includes('No repos selected'))).toBe(true);
  });

  it('should run post-checkout commands on newly added repos', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1 (no post-checkout)
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runBranch } = await import('../branch.js');
    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Configure post-checkout for the add
    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "installed" > postcheckout.txt',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const addCheckboxStub = sinon.stub().resolves([repo2]);
    const addConfirmStub = sinon.stub().resolves(true);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAdd(undefined, integration.useCases, integration.services, {
      checkbox: addCheckboxStub,
      input: inputStub,
      confirm: addConfirmStub,
    });

    // Verify post-checkout ran in the new repo
    const wt2 = path.join(destPath, 'feature', 'repo2');
    const content = fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim();
    expect(content).toBe('installed');
  });
});
