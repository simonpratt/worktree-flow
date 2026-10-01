import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runCreate } from '../create.js';
import { WorkspaceAlreadyExistsError, RepoNotFoundError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('create integration', () => {
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

    const pickReposStub = sinon.stub().resolves([repo1, repo2]);

    await runCreate('new-feature', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
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

  it('should create worktrees for repos passed via --repo, skipping the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate(
      'new-feature',
      integration.useCases,
      integration.services,
      { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub },
      { repos: ['repo1'] }
    );

    expect(pickReposStub.called).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'new-feature', 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(destPath, 'new-feature', 'repo2'))).toBe(false);
  });

  it('should use --from to skip the source branch prompt', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate(
      'new-feature',
      integration.useCases,
      integration.services,
      { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub },
      { repos: ['repo1'], sourceBranch: 'master' }
    );

    expect(inputStub.called).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'new-feature', 'repo1'))).toBe(true);
  });

  it('should use --post-checkout to skip the post-checkout prompt and run it', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "ran" > postcheckout.txt',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate(
      'new-feature',
      integration.useCases,
      integration.services,
      { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub },
      { repos: ['repo1'], sourceBranch: 'master', postCheckout: true }
    );

    expect(confirmStub.called).toBe(false);
    const wt1 = path.join(destPath, 'new-feature', 'repo1');
    expect(fs.readFileSync(path.join(wt1, 'postcheckout.txt'), 'utf-8').trim()).toBe('ran');
  });

  it('should use --no-post-checkout to skip the post-checkout prompt and not run it', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
      postCheckout: 'echo "ran" > postcheckout.txt',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
    });

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate(
      'new-feature',
      integration.useCases,
      integration.services,
      { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub },
      { repos: ['repo1'], sourceBranch: 'master', postCheckout: false }
    );

    expect(confirmStub.called).toBe(false);
    const wt1 = path.join(destPath, 'new-feature', 'repo1');
    expect(fs.existsSync(path.join(wt1, 'postcheckout.txt'))).toBe(false);
  });

  it('should throw RepoNotFoundError when --repo names an unknown repo', async () => {
    await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([]);

    await expect(
      runCreate(
        'new-feature',
        integration.useCases,
        integration.services,
        { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub },
        { repos: ['does-not-exist'] }
      )
    ).rejects.toThrow(RepoNotFoundError);
  });

  it('should throw WorkspaceAlreadyExistsError when workspace dir exists', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    // Pre-create the workspace directory
    fs.mkdirSync(path.join(destPath, 'new-feature'), { recursive: true });

    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([repo1]);

    await expect(
      runCreate('new-feature', integration.useCases, integration.services, {
        pickRepos: pickReposStub,
        input: inputStub,
        confirm: confirmStub,
      })
    ).rejects.toThrow(WorkspaceAlreadyExistsError);
  });

  it('should copy all top-level .md files from source path into the workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    fs.writeFileSync(path.join(sourcePath, 'AGENTS.md'), '# Agents');
    fs.writeFileSync(path.join(sourcePath, 'NOTES.md'), '# Notes');
    fs.writeFileSync(path.join(sourcePath, 'notes.txt'), 'not markdown');

    integration = createIntegrationServices(sourcePath, destPath);

    await runCreate('new-feature', integration.useCases, integration.services, {
      pickRepos: sinon.stub().resolves([repo1]),
      input: inputStub,
      confirm: confirmStub,
    });

    const workspacePath = path.join(destPath, 'new-feature');
    expect(fs.readFileSync(path.join(workspacePath, 'AGENTS.md'), 'utf-8')).toBe('# Agents');
    expect(fs.readFileSync(path.join(workspacePath, 'NOTES.md'), 'utf-8')).toBe('# Notes');
    expect(fs.existsSync(path.join(workspacePath, 'notes.txt'))).toBe(false);
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

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
      input: inputStub,
      confirm: confirmStub,
    });

    expect(pickReposStub.firstCall.args[0].initialValues).toEqual([repo1]);
  });

  it('should list all repos alphabetically regardless of recent usage', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // repo3 was branched from most recently, but should not be promoted
    integration.services.fetchCache.getRecentlyUsedRepos = sinon.stub().returns(['repo3']);

    const pickReposStub = sinon.stub().resolves([repo1]);

    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
      input: inputStub,
      confirm: confirmStub,
    });

    expect(pickReposStub.firstCall.args[0].options).toEqual([
      { value: repo1, label: 'repo1' },
      { value: repo2, label: 'repo2' },
      { value: repo3, label: 'repo3' },
    ]);
  });

  it('should track branch usage for selected repos after creation', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([repo1, repo2]);

    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
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

    const pickReposStub = sinon.stub().resolves([repo1, repo2, repo3]);
    confirmStub.resolves(true);

    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
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

    const pickReposStub = sinon.stub().resolves([repo1, repo2, repo3]);
    confirmStub.resolves(true); // Confirm running post-checkout

    await runCreate('feature-test', integration.useCases, integration.services, {
      pickRepos: pickReposStub,
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
