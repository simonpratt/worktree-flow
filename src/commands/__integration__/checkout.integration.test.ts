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
    await runCheckout('feature', integration.services, { confirm: confirmStub });

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
      runCheckout('nonexistent', integration.services, { confirm: confirmStub })
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
    await runCheckout('feature', integration.services, { confirm: confirmStub });

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
    await runCheckout('feature', integration.services, { confirm: confirmStub });

    const agentsMd = path.join(destPath, 'feature', 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
    expect(fs.readFileSync(agentsMd, 'utf-8')).toBe('# Agents\nDo stuff.\n');
  });
});
