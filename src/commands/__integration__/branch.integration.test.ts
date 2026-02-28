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

    await runBranch('new-feature', integration.useCases, integration.services, {
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
      runBranch('new-feature', integration.useCases, integration.services, {
        checkbox: checkboxStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(WorkspaceAlreadyExistsError);
  });

  it('should pre-check repos configured in branch-repos', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: undefined,
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: ['repo1'],
    });

    const checkboxStub = sinon.stub().resolves([repo1]);

    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const choices = checkboxStub.firstCall.args[0].choices;
    const repo1Choice = choices.find((c: any) => c.name === 'repo1');
    const repo2Choice = choices.find((c: any) => c.name === 'repo2');
    expect(repo1Choice.checked).toBe(true);
    expect(repo2Choice.checked).toBe(false);
  });

  it('should list commonly used repos at the top of checkbox choices with a heading', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // repo1 and repo3 have been branched from before, repo2 has not
    integration.services.fetchCache.getRecentlyUsedRepos = sinon.stub().returns(['repo1', 'repo3']);

    const checkboxStub = sinon.stub().resolves([repo1]);

    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const choices = checkboxStub.firstCall.args[0].choices;

    // First item should be a separator with "Recently Used" heading
    expect(choices[0].separator).toBeDefined();
    expect(choices[0].separator).toMatch(/recently used/i);

    // Commonly used repos (alphabetical: repo1, repo3) should come before repo2
    const repoChoices = choices.filter((c: any) => c.name !== undefined);
    const commonlyUsedChoices = repoChoices.slice(0, 2);
    const remainingChoices = repoChoices.slice(2);

    expect(commonlyUsedChoices.map((c: any) => c.name)).toEqual(['repo1', 'repo3']);
    expect(remainingChoices.map((c: any) => c.name)).toEqual(['repo2']);
  });

  it('should track branch usage for selected repos after creation', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const checkboxStub = sinon.stub().resolves([repo1, repo2]);

    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const trackStub = integration.services.fetchCache.trackBranchUsage as sinon.SinonStub;
    expect(trackStub.calledOnce).toBe(true);
    expect(trackStub.firstCall.args[0]).toEqual(expect.arrayContaining(['repo1', 'repo2']));
  });

  it('should respect flow-config.json copy-files and post-checkout with correct priority ordering', async () => {
    // repo1: no flow-config.json — uses global for both copy-files and post-checkout
    // repo2: flow-config.json with copy-files and post-checkout — overrides global for both
    // repo3: flow-config.json with post-checkout AND a central perRepoPostCheckout — central wins
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    fs.writeFileSync(path.join(repo1, '.env'), 'REPO1=global\n');
    fs.writeFileSync(path.join(repo2, 'flow-config.json'), JSON.stringify({ 'copy-files': '.env.local', 'post-checkout': 'echo "repo2-config" > postcheckout.txt' }));
    fs.writeFileSync(path.join(repo2, '.env.local'), 'REPO2=local\n');
    fs.writeFileSync(path.join(repo3, 'flow-config.json'), JSON.stringify({ 'post-checkout': 'echo "repo3-config" > postcheckout.txt' }));

    integration = createIntegrationServices(sourcePath, destPath);

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "global" > postcheckout.txt',
      perRepoPostCheckout: {
        repo3: 'echo "repo3-central" > postcheckout.txt',
      },
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const checkboxStub = sinon.stub().resolves([repo1, repo2, repo3]);
    confirmStub.resolves(true);

    await runBranch('feature', integration.useCases, integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    const wt1 = path.join(destPath, 'feature', 'repo1');
    const wt2 = path.join(destPath, 'feature', 'repo2');
    const wt3 = path.join(destPath, 'feature', 'repo3');

    // repo1: global copy-files (.env) and global post-checkout
    expect(fs.existsSync(path.join(wt1, '.env'))).toBe(true);
    expect(fs.readFileSync(path.join(wt1, 'postcheckout.txt'), 'utf-8').trim()).toBe('global');

    // repo2: flow-config.json copy-files (.env.local) overrides global, flow-config.json post-checkout overrides global
    expect(fs.existsSync(path.join(wt2, '.env.local'))).toBe(true);
    expect(fs.existsSync(path.join(wt2, '.env'))).toBe(false);
    expect(fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim()).toBe('repo2-config');

    // repo3: central perRepoPostCheckout takes priority over flow-config.json post-checkout
    expect(fs.readFileSync(path.join(wt3, 'postcheckout.txt'), 'utf-8').trim()).toBe('repo3-central');
  });

  it('should run per-repo post-checkout commands, falling back to global', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // Configure post-checkout commands
    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "global" > postcheckout.txt',
      perRepoPostCheckout: {
        repo1: 'echo "repo1-custom" > postcheckout.txt',
        repo2: 'echo "repo2-custom" > postcheckout.txt',
      },
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const checkboxStub = sinon.stub().resolves([repo1, repo2, repo3]);
    confirmStub.resolves(true); // Confirm running post-checkout

    await runBranch('feature-test', integration.useCases, integration.services, {
      checkbox: checkboxStub,
      input: inputStub,
      confirm: confirmStub,
    });

    // Verify post-checkout ran with per-repo overrides
    const wt1 = path.join(destPath, 'feature-test', 'repo1');
    const wt2 = path.join(destPath, 'feature-test', 'repo2');
    const wt3 = path.join(destPath, 'feature-test', 'repo3');

    const content1 = fs.readFileSync(path.join(wt1, 'postcheckout.txt'), 'utf-8').trim();
    const content2 = fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim();
    const content3 = fs.readFileSync(path.join(wt3, 'postcheckout.txt'), 'utf-8').trim();

    expect(content1).toBe('repo1-custom'); // Per-repo override
    expect(content2).toBe('repo2-custom'); // Per-repo override
    expect(content3).toBe('global'); // Global fallback
  });
});
