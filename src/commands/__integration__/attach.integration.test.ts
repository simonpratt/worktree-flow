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
  let pickGroupsStub: sinon.SinonStub;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    confirmStub = sinon.stub().resolves(false);
    inputStub = sinon.stub().resolves('master');
    pickGroupsStub = sinon.stub().resolves([]);
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should throw NotInWorkspaceError when cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    const pickReposStub = sinon.stub().resolves([]);

    await expect(
      runAttach(undefined, integration.useCases, integration.services, {
        pickRepos: pickReposStub,
        input: inputStub,
        confirm: confirmStub,
        pickGroups: pickGroupsStub,
      })
    ).rejects.toThrow(NotInWorkspaceError);
  });

  it('should throw WorkspaceNotFoundError when explicit branch does not exist', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    const pickReposStub = sinon.stub().resolves([]);

    await expect(
      runAttach('nonexistent', integration.useCases, integration.services, {
        pickRepos: pickReposStub,
        input: inputStub,
        confirm: confirmStub,
        pickGroups: pickGroupsStub,
      })
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should attach new repos to an existing workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    integration = createIntegrationServices(sourcePath, destPath);

    // First create a workspace with repo1 only
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Verify only repo1 exists initially
    const workspacePath = path.join(destPath, 'feature');
    expect(fs.existsSync(path.join(workspacePath, 'repo1'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(false);

    // Now attach repo2 and repo3 via the attach command
    const attachPickReposStub = sinon.stub().resolves([repo2, repo3]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
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

  it('should check out the real branch name when auto-detecting a workspace whose branch name was sanitized', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const { runCreate } = await import('../create.js');
    await runCreate('feature/ABC-123', integration.useCases, integration.services, {
      pickRepos: sinon.stub().resolves([repo1]),
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const workspacePath = path.join(destPath, 'feature_ABC-123');
    (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: sinon.stub().resolves([repo2]),
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    const { stdout: branch2 } = await shell.execFile('git', ['-C', path.join(workspacePath, 'repo2'), 'branch', '--show-current']);
    expect(branch2.trim()).toBe('feature/ABC-123');
  });

  it('should use explicit branch name to resolve workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Attach repo2 using explicit branch name (cwd doesn't matter)
    const attachPickReposStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/somewhere-else');

    await runAttach('feature', integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const workspacePath = path.join(destPath, 'feature');
    expect(fs.existsSync(path.join(workspacePath, 'repo2'))).toBe(true);
  });

  it('should exclude repos already in the workspace from the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Run attach - picker should only show repo2
    const attachPickReposStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Verify picker options only contained repo2
    const options = attachPickReposStub.firstCall.args[0].options;
    const repoNames = options.map((o: any) => o.label);
    expect(repoNames).toEqual(['repo2']);
    expect(repoNames).not.toContain('repo1');
  });

  it('should attach repos passed via --repo, skipping the picker', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const attachPickReposStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(
      undefined,
      integration.useCases,
      integration.services,
      { pickRepos: attachPickReposStub, input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
      { repos: ['repo2'] }
    );

    expect(attachPickReposStub.called).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'feature', 'repo2'))).toBe(true);
  });

  it('should use --from to skip the source branch prompt', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const attachPickReposStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));
    inputStub.resetHistory();

    await runAttach(
      undefined,
      integration.useCases,
      integration.services,
      { pickRepos: attachPickReposStub, input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
      { sourceBranch: 'master' }
    );

    expect(inputStub.called).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'feature', 'repo2'))).toBe(true);
  });

  it('should use --post-checkout / --no-post-checkout to skip the post-checkout prompt', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      sessionManager: 'none',
      postCheckout: 'echo "ran" > postcheckout.txt',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      repoGroups: {},
    });

    const attachPickReposStub = sinon.stub().resolves([repo2]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(
      undefined,
      integration.useCases,
      integration.services,
      { pickRepos: attachPickReposStub, input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
      { sourceBranch: 'master', postCheckout: false }
    );

    expect(confirmStub.called).toBe(false);
    const wt2 = path.join(destPath, 'feature', 'repo2');
    expect(fs.existsSync(path.join(wt2, 'postcheckout.txt'))).toBe(false);
  });

  it('should throw RepoNotFoundError when --repo names a repo already in the workspace', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    const attachPickReposStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await expect(
      runAttach(
        undefined,
        integration.useCases,
        integration.services,
        { pickRepos: attachPickReposStub, input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
        { repos: ['repo1'] }
      )
    ).rejects.toThrow(RepoNotFoundError);
  });

  it('should do nothing when no repos are selected', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create workspace with repo1
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Run attach but select nothing (repo2 is available but not selected)
    const attachPickReposStub = sinon.stub().resolves([]);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
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
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    // Configure post-checkout for the attach
    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      sessionManager: 'none',
      postCheckout: 'echo "installed" > postcheckout.txt',
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      repoGroups: {},
    });

    const attachPickReposStub = sinon.stub().resolves([repo2]);
    const attachConfirmStub = sinon.stub().resolves(true);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: attachConfirmStub,
      pickGroups: pickGroupsStub,
    });

    // Verify post-checkout ran in the new repo
    const wt2 = path.join(destPath, 'feature', 'repo2');
    const content = fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim();
    expect(content).toBe('installed');
  });

  describe('with a session manager', () => {
    async function attachRepo2(sessionExists: boolean) {
      const repo1 = await initGitRepo(sourcePath, 'repo1');
      const repo2 = await initGitRepo(sourcePath, 'repo2');

      integration = createIntegrationServices(sourcePath, destPath);
      const { runCreate } = await import('../create.js');
      await runCreate('feature', integration.useCases, integration.services, {
        pickRepos: sinon.stub().resolves([repo1]),
        input: inputStub,
        confirm: confirmStub,
        pickGroups: pickGroupsStub,
      });

      integration.services.config.load = sinon.stub().returns({
        sourcePath,
        destPath,
        copyFiles: '.env',
        sessionManager: 'tmux',
        postCheckout: 'npm ci',
        perRepoPostCheckout: {},
        fetchCacheTtlSeconds: 300,
        repoGroups: {},
      });
      const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
      tmuxStub.exists.withArgs('feature').resolves(sessionExists);
      (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

      await runAttach(undefined, integration.useCases, integration.services, {
        pickRepos: sinon.stub().resolves([repo2]),
        input: inputStub,
        confirm: sinon.stub().resolves(true),
        pickGroups: pickGroupsStub,
      });

      return tmuxStub;
    }

    it('should add panes for only the new repos to the existing session', async () => {
      const tmuxStub = await attachRepo2(true);

      sinon.assert.notCalled(tmuxStub.create);
      sinon.assert.calledOnceWithExactly(tmuxStub.addPanes, 'feature', [
        { path: path.join(destPath, 'feature', 'repo2'), command: 'npm ci' },
      ]);
    });

    it('should open the session with every repo when the workspace has none, running post-checkout only in the new ones', async () => {
      const tmuxStub = await attachRepo2(false);

      sinon.assert.notCalled(tmuxStub.addPanes);
      sinon.assert.calledOnceWithExactly(tmuxStub.create, 'feature', path.join(destPath, 'feature'), [
        { path: path.join(destPath, 'feature', 'repo1'), command: undefined },
        { path: path.join(destPath, 'feature', 'repo2'), command: 'npm ci' },
      ]);
    });
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
    const branchPickReposStub = sinon.stub().resolves([repo1]);
    const { runCreate } = await import('../create.js');
    await runCreate('feature', integration.useCases, integration.services, {
      pickRepos: branchPickReposStub,
      input: inputStub,
      confirm: confirmStub,
      pickGroups: pickGroupsStub,
    });

    fs.writeFileSync(path.join(repo2, 'flow-config.json'), JSON.stringify({ 'copy-files': '.env.local', 'post-checkout': 'echo "repo2-config" > postcheckout.txt' }));
    fs.writeFileSync(path.join(repo2, '.env.local'), 'REPO2=local\n');
    fs.writeFileSync(path.join(repo3, '.env'), 'REPO3=global\n');
    fs.writeFileSync(path.join(repo4, 'flow-config.json'), JSON.stringify({ 'post-checkout': 'echo "repo4-config" > postcheckout.txt' }));

    integration.services.config.load = sinon.stub().returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      sessionManager: 'none',
      postCheckout: 'echo "global" > postcheckout.txt',
      perRepoPostCheckout: {
        repo4: 'echo "repo4-central" > postcheckout.txt',
      },
      fetchCacheTtlSeconds: 300,
      repoGroups: {},
    });

    const attachPickReposStub = sinon.stub().resolves([repo2, repo3, repo4]);
    const attachConfirmStub = sinon.stub().resolves(true);
    (integration.stubs.process.cwd as sinon.SinonStub).returns(path.join(destPath, 'feature'));

    await runAttach(undefined, integration.useCases, integration.services, {
      pickRepos: attachPickReposStub,
      input: inputStub,
      confirm: attachConfirmStub,
      pickGroups: pickGroupsStub,
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

  describe('repo groups', () => {
    async function createWorkspaceWith(repoNames: string[]): Promise<string> {
      const { runCreate } = await import('../create.js');
      await runCreate(
        'feature',
        integration.useCases,
        integration.services,
        { pickRepos: sinon.stub(), input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
        { repos: repoNames, sourceBranch: 'master' }
      );
      const workspacePath = path.join(destPath, 'feature');
      (integration.stubs.process.cwd as sinon.SinonStub).returns(workspacePath);
      return workspacePath;
    }

    function setRepoGroups(groups: Record<string, string[]>) {
      const load = integration.services.config.load as sinon.SinonStub;
      load.returns({ ...load(), repoGroups: groups });
    }

    it('should attach the members of --group that are not already in the workspace', async () => {
      await initGitRepo(sourcePath, 'api-1');
      await initGitRepo(sourcePath, 'api-2');
      await initGitRepo(sourcePath, 'client');
      integration = createIntegrationServices(sourcePath, destPath);
      const workspacePath = await createWorkspaceWith(['api-1']);
      setRepoGroups({ backend: ['api-1', 'api-2'] });
      const pickReposStub = sinon.stub();

      await runAttach(
        undefined,
        integration.useCases,
        integration.services,
        { pickRepos: pickReposStub, input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
        { groups: ['backend'], sourceBranch: 'master' }
      );

      sinon.assert.notCalled(pickReposStub);
      expect(fs.existsSync(path.join(workspacePath, 'api-2'))).toBe(true);
      expect(fs.existsSync(path.join(workspacePath, 'client'))).toBe(false);
    });

    it('should report nothing to attach when every member of --group is already in the workspace', async () => {
      await initGitRepo(sourcePath, 'api-1');
      await initGitRepo(sourcePath, 'client');
      integration = createIntegrationServices(sourcePath, destPath);
      await createWorkspaceWith(['api-1']);
      setRepoGroups({ backend: ['api-1'] });

      await runAttach(
        undefined,
        integration.useCases,
        integration.services,
        { pickRepos: sinon.stub(), input: inputStub, confirm: confirmStub, pickGroups: pickGroupsStub },
        { groups: ['backend'], sourceBranch: 'master' }
      );

      const logs = (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0]);
      expect(logs).toContain('Nothing to attach: the selected repos are already in this workspace.');
      sinon.assert.notCalled(integration.stubs.process.exit);
    });

    it('should pre-select only the chosen group members not already in the workspace', async () => {
      const api1 = await initGitRepo(sourcePath, 'api-1');
      const api2 = await initGitRepo(sourcePath, 'api-2');
      await initGitRepo(sourcePath, 'client');
      integration = createIntegrationServices(sourcePath, destPath);
      await createWorkspaceWith(['api-1']);
      setRepoGroups({ backend: ['api-1', 'api-2'] });
      pickGroupsStub.resolves(['backend']);
      const pickReposStub = sinon.stub().resolves([api2]);

      await runAttach(undefined, integration.useCases, integration.services, {
        pickRepos: pickReposStub,
        input: inputStub,
        confirm: confirmStub,
        pickGroups: pickGroupsStub,
      });

      const { options, initialValues } = pickReposStub.firstCall.args[0];
      expect(options.map((o: { value: string }) => o.value)).not.toContain(api1);
      expect(initialValues).toEqual([api2]);
    });
  });
});
