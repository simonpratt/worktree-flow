import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runAttach } from '../attach.js';
import { NotInWorkspaceError, WorkspaceNotFoundError, RepoNotFoundError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('attach integration', () => {
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
      runAttach(undefined, integration.useCases, integration.services, {
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
      runAttach('nonexistent', integration.useCases, integration.services, {
        checkbox: checkboxStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should attach new repos to an existing workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // First create a workspace with repo1 only
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify only repo1 exists initially
    const workspacePath = path.join(destPath, 'feature');
    expect(fs.existsSync(path.join(workspacePath, 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(false);

    // Now attach repo2 and repo3 via the attach command
    const attachCheckboxStub = sinon.stub().resolves([repo2, repo3]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);

    await runAttach(undefined, integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify all repos exist
    expect(fs.existsSync(path.join(workspacePath, 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo3'))).toBe(true);

    // Verify correct branch in the attached worktrees
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
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Attach repo2 using explicit branch name (cwd doesn't matter)
    const attachCheckboxStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/somewhere-else');

    await runAttach('feature', integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
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
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Run attach - checkbox should only show repo2
    const attachCheckboxStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify checkbox choices only contained repo2
    const choices = attachCheckboxStub.firstCall.args[0].choices;
    const repoNames = choices.filter((c: any) => c.name !== undefined).map((c: any) => c.name);
    expect(repoNames).toEqual(['repo2']);
    expect(repoNames).not.toContain('repo1');
  });

  it('should attach repos passed via --repo, skipping the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const attachCheckboxStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(
      undefined,
      integration.useCases,
      integration.services,
      { checkbox: attachCheckboxStub, input: inputStub, confirm: confirmStub },
      { repos: ['repo2'] }
    );

    expect(attachCheckboxStub.called).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'feature', 'repo2'))).toBe(true);
  });

  it('should throw RepoNotFoundError when --repo names a repo already in the workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const attachCheckboxStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await expect(
      runAttach(
        undefined,
        integration.useCases,
        integration.services,
        { checkbox: attachCheckboxStub, input: inputStub, confirm: confirmStub },
        { repos: ['repo1'] }
      )
    ).rejects.toThrow(RepoNotFoundError);
  });

  it('should do nothing when no repos are selected', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Run attach but select nothing (repo2 is available but not selected)
    const attachCheckboxStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    expect(logCalls.some((line: string) => line.includes('No repos selected'))).toBe(true);
  });

  it('should run post-checkout commands on newly attached repos', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1 (no post-checkout)
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Configure post-checkout for the attach
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

    const attachCheckboxStub = sinon.stub().resolves([repo2]);
    const attachConfirmStub = sinon.stub().resolves(true);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
      input: inputStub,
      confirm: attachConfirmStub,
    });

    // Verify post-checkout ran in the new repo
    const wt2 = path.join(destPath, 'feature', 'repo2');
    const content = fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim();
    expect(content).toBe('installed');
  });

  it('should respect flow-config.json copy-files and post-checkout with correct priority ordering', async () => {
    // repo1: used to seed the workspace (no assertions on it)
    // repo2: flow-config.json with copy-files and post-checkout — overrides global for both
    // repo3: no flow-config.json — uses global for both copy-files and post-checkout
    // repo4: flow-config.json with post-checkout AND a central perRepoPostCheckout — central wins
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');
    const repo4 = await initGitRepo(sourcePath, 'repo4');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1 first (no post-checkout)
    const branchCheckboxStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      checkbox: branchCheckboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    fs.writeFileSync(path.join(repo2, 'flow-config.json'), JSON.stringify({ 'copy-files': '.env.local', 'post-checkout': 'echo "repo2-config" > postcheckout.txt' }));
    fs.writeFileSync(path.join(repo2, '.env.local'), 'REPO2=local\n');
    fs.writeFileSync(path.join(repo3, '.env'), 'REPO3=global\n');
    fs.writeFileSync(path.join(repo4, 'flow-config.json'), JSON.stringify({ 'post-checkout': 'echo "repo4-config" > postcheckout.txt' }));

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "global" > postcheckout.txt',
      perRepoPostCheckout: {
        repo4: 'echo "repo4-central" > postcheckout.txt',
      },
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const attachCheckboxStub = sinon.stub().resolves([repo2, repo3, repo4]);
    const attachConfirmStub = sinon.stub().resolves(true);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      checkbox: attachCheckboxStub,
      input: inputStub,
      confirm: attachConfirmStub,
    });

    const wt2 = path.join(destPath, 'feature', 'repo2');
    const wt3 = path.join(destPath, 'feature', 'repo3');
    const wt4 = path.join(destPath, 'feature', 'repo4');

    // repo2: flow-config.json copy-files (.env.local) overrides global, flow-config.json post-checkout overrides global
    expect(fs.existsSync(path.join(wt2, '.env.local'))).toBe(true);
    expect(fs.existsSync(path.join(wt2, '.env'))).toBe(false);
    expect(fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim()).toBe('repo2-config');

    // repo3: global copy-files (.env) and global post-checkout
    expect(fs.existsSync(path.join(wt3, '.env'))).toBe(true);
    expect(fs.readFileSync(path.join(wt3, 'postcheckout.txt'), 'utf-8').trim()).toBe('global');

    // repo4: central perRepoPostCheckout takes priority over flow-config.json post-checkout
    expect(fs.readFileSync(path.join(wt4, 'postcheckout.txt'), 'utf-8').trim()).toBe('repo4-central');
  });
});
