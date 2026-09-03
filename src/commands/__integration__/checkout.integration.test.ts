import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runCheckout } from '../checkout.js';
import {
  createTempDir,
  initGitRepo,
  createRemoteBranchRef,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('checkout integration', () => {
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
    confirmStub = sinon.stub().resolves(false);
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should checkout worktrees only for repos with matching branch', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    await initGitRepo(sourcePath, 'repo3');
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');

    integration = createIntegrationServices(sourcePath, destPath);
    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();

    // Both matching repos should have worktrees with correct branch
    for (const name of ['repo1', 'repo2']) {
      const wt = path.join(destPath, 'feature', name);
      expect(fs.existsSync(wt)).toBe(true);
      const { stdout } = await shell.execFile('git', ['-C', wt, 'branch', '--show-current']);
      expect(stdout.trim()).toBe('feature');
    }

    // repo3 has no branch — should be excluded
    expect(fs.existsSync(path.join(destPath, 'feature', 'repo3'))).toBe(false);
  });

  it('should call process.exit(1) when branch not found in any repo', async () => {
    await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.exit as sinon.SinonStub).throws(new Error('exit'));

    await expect(
      runCheckout('nonexistent', integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow('exit');

    sinon.assert.calledWith(integration.stubs.process.exit as any, 1);
  });

  it('should copy config files (.env) to each worktree', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');

    // Create .env in both source repos
    fs.writeFileSync(path.join(repo1, '.env'), 'SECRET=repo1\n');
    fs.writeFileSync(path.join(repo2, '.env'), 'SECRET=repo2\n');

    integration = createIntegrationServices(sourcePath, destPath);
    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

    for (const [name, expected] of [['repo1', 'SECRET=repo1\n'], ['repo2', 'SECRET=repo2\n']] as const) {
      const envPath = path.join(destPath, 'feature', name, '.env');
      expect(fs.existsSync(envPath)).toBe(true);
      expect(fs.readFileSync(envPath, 'utf-8')).toBe(expected);
    }
  });

  it('should copy AGENTS.md to workspace root', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await createRemoteBranchRef(repo1, 'feature');

    // Create AGENTS.md in source directory
    fs.writeFileSync(path.join(sourcePath, 'AGENTS.md'), '# Agents\nDo stuff.\n');

    integration = createIntegrationServices(sourcePath, destPath);
    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

    const agentsMd = path.join(destPath, 'feature', 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
    expect(fs.readFileSync(agentsMd, 'utf-8')).toBe('# Agents\nDo stuff.\n');
  });

  it('should copy .devcontainer folder to workspace root', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    await createRemoteBranchRef(repo1, 'feature');

    // Create .devcontainer folder in source directory
    fs.mkdirSync(path.join(sourcePath, '.devcontainer'), { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, '.devcontainer', 'devcontainer.json'),
      '{"name":"test"}\n'
    );
    fs.writeFileSync(
      path.join(sourcePath, '.devcontainer', 'Dockerfile'),
      'FROM node:24\n'
    );

    integration = createIntegrationServices(sourcePath, destPath);
    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

    const devcontainerJson = path.join(destPath, 'feature', '.devcontainer', 'devcontainer.json');
    const dockerfile = path.join(destPath, 'feature', '.devcontainer', 'Dockerfile');
    expect(fs.existsSync(devcontainerJson)).toBe(true);
    expect(fs.readFileSync(devcontainerJson, 'utf-8')).toBe('{"name":"test"}\n');
    expect(fs.existsSync(dockerfile)).toBe(true);
    expect(fs.readFileSync(dockerfile, 'utf-8')).toBe('FROM node:24\n');
  });

  it('should respect flow-config.json copy-files and post-checkout with correct priority ordering', async () => {
    // repo1: no flow-config.json — uses global for both copy-files and post-checkout
    // repo2: flow-config.json with copy-files and post-checkout — overrides global for both
    // repo3: flow-config.json with post-checkout AND a central perRepoPostCheckout — central wins
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');
    await createRemoteBranchRef(repo3, 'feature');

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
    });

    confirmStub.resolves(true);

    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

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
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');
    await createRemoteBranchRef(repo3, 'feature');

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
        repo3: 'echo "repo3-custom" > postcheckout.txt',
      },
      fetchCacheTtlSeconds: 300,
    });

    confirmStub.resolves(true); // Confirm running post-checkout

    await runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub });

    // Verify post-checkout ran with per-repo overrides
    const wt1 = path.join(destPath, 'feature', 'repo1');
    const wt2 = path.join(destPath, 'feature', 'repo2');
    const wt3 = path.join(destPath, 'feature', 'repo3');

    const content1 = fs.readFileSync(path.join(wt1, 'postcheckout.txt'), 'utf-8').trim();
    const content2 = fs.readFileSync(path.join(wt2, 'postcheckout.txt'), 'utf-8').trim();
    const content3 = fs.readFileSync(path.join(wt3, 'postcheckout.txt'), 'utf-8').trim();

    expect(content1).toBe('repo1-custom'); // Per-repo override
    expect(content2).toBe('global'); // Global fallback
    expect(content3).toBe('repo3-custom'); // Per-repo override
  });

  it('should abort with error when branch is already checked out in a repo', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');

    // Check out the target branch in repo1's main working tree
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();
    await shell.execFile('git', ['-C', repo1, 'checkout', 'feature']);

    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.exit as sinon.SinonStub).throws(new Error('exit'));

    await expect(
      runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow('exit');

    // Should exit non-zero
    sinon.assert.calledWith(integration.stubs.process.exit as any, 1);

    // Should report the offending repo
    const errorCalls = integration.stubs.console.error.args.map((a: any[]) => a[0]);
    const hasRepoError = errorCalls.some((msg: string) =>
      msg.includes('repo1') && msg.includes('already checked out')
    );
    expect(hasRepoError).toBe(true);

    // Workspace directory should NOT have been created
    expect(fs.existsSync(path.join(destPath, 'feature'))).toBe(false);
  });

  it('should report per-repo worktree failures and exit non-zero', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    await createRemoteBranchRef(repo1, 'feature');
    await createRemoteBranchRef(repo2, 'feature');

    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.exit as sinon.SinonStub).throws(new Error('exit'));

    // Stub worktree.createWorktreeCheckout to fail for repo2 only
    const originalCreateWorktreeCheckout = integration.services.worktree.createWorktreeCheckout.bind(integration.services.worktree);
    sinon.stub(integration.services.worktree, 'createWorktreeCheckout').callsFake(
      async (repoPath: string, worktreePath: string, branchName: string) => {
        if (repoPath.endsWith('repo2')) {
          const err: any = new Error('worktree add failed');
          err.stderr = "fatal: unable to create worktree for 'repo2'";
          throw err;
        }
        return originalCreateWorktreeCheckout(repoPath, worktreePath, branchName);
      }
    );

    await expect(
      runCheckout('feature', integration.useCases, integration.services, { confirm: confirmStub })
    ).rejects.toThrow('exit');

    // Should exit non-zero
    sinon.assert.calledWith(integration.stubs.process.exit as any, 1);

    // repo1 should have succeeded — worktree created
    const wt1 = path.join(destPath, 'feature', 'repo1');
    expect(fs.existsSync(wt1)).toBe(true);

    // Should report repo2's failure with its name and the git error
    const errorCalls = integration.stubs.console.error.args.map((a: any[]) => a[0]);
    const hasRepo2Error = errorCalls.some((msg: string) =>
      msg.includes('repo2')
    );
    expect(hasRepo2Error).toBe(true);
  });

  it('should checkout local branches that have not been pushed to origin', async () => {
    const { NodeShell } = await import('../../adapters/node.js');
    const shell = new NodeShell();

    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    const repo3 = await initGitRepo(sourcePath, 'repo3');

    // Create local branches without remote tracking refs (simulating unpushed branches)
    await shell.execFile('git', ['-C', repo1, 'branch', 'local-feature']);
    await shell.execFile('git', ['-C', repo2, 'branch', 'local-feature']);
    // repo3 does not have the branch

    integration = createIntegrationServices(sourcePath, destPath);
    await runCheckout('local-feature', integration.useCases, integration.services, { confirm: confirmStub });

    // Both repos with local branches should have worktrees created
    for (const name of ['repo1', 'repo2']) {
      const wt = path.join(destPath, 'local-feature', name);
      expect(fs.existsSync(wt)).toBe(true);
      const { stdout } = await shell.execFile('git', ['-C', wt, 'branch', '--show-current']);
      expect(stdout.trim()).toBe('local-feature');
    }

    // repo3 has no branch — should be excluded
    expect(fs.existsSync(path.join(destPath, 'local-feature', 'repo3'))).toBe(false);
  });
});
