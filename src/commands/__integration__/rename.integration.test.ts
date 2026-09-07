import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runRename } from '../rename.js';
import { WorkspaceNotFoundError, WorkspaceAlreadyExistsError, NotInWorkspaceError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  ProcessExitError,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';
import { NodeShell } from '../../adapters/node.js';

const shell = new NodeShell();

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await shell.execFile('git', args, { cwd });
  return stdout;
}

describe('rename integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should throw WorkspaceNotFoundError when the old workspace does not exist', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    await expect(
      runRename('does-not-exist', 'new-name', integration.useCases, integration.services)
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should throw NotInWorkspaceError when auto-detecting and cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    await expect(
      runRename(undefined, 'new-name', integration.useCases, integration.services)
    ).rejects.toThrow(NotInWorkspaceError);
  });

  it('should throw when new name matches the current name', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    integration = createIntegrationServices(sourcePath, destPath);
    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await expect(
      runRename('feature', 'feature', integration.useCases, integration.services)
    ).rejects.toThrow('is the same as the current name');
  });

  it('should throw WorkspaceAlreadyExistsError when a workspace already exists at the new name', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    integration = createIntegrationServices(sourcePath, destPath);

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });
    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-b',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await expect(
      runRename('feature-a', 'feature-b', integration.useCases, integration.services)
    ).rejects.toThrow(WorkspaceAlreadyExistsError);

    // Neither workspace should have been touched
    expect(fs.existsSync(path.join(destPath, 'feature-a'))).toBe(true);
    expect(fs.existsSync(path.join(destPath, 'feature-b'))).toBe(true);
  });

  it('should rename branches, worktrees, and the workspace directory on the happy path', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);
    const created = await createTestWorkspace(integration.useCases, {
      repos: [repo1, repo2],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const oldWorkspacePath = created.workspacePath;
    const newWorkspacePath = path.join(destPath, 'new-feature');

    await runRename('old-feature', 'new-feature', integration.useCases, integration.services);

    // Old workspace directory is gone, new one exists
    expect(fs.existsSync(oldWorkspacePath)).toBe(false);
    expect(fs.existsSync(newWorkspacePath)).toBe(true);

    // Each worktree moved and is now on the new branch
    for (const repoName of ['repo1', 'repo2']) {
      const worktreePath = path.join(newWorkspacePath, repoName);
      expect(fs.existsSync(worktreePath)).toBe(true);

      const currentBranch = (await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      expect(currentBranch).toBe('new-feature');
    }

    // New branch exists in each source repo, pointing at the same commit as old-feature did
    for (const repoPath of [repo1, repo2]) {
      const branches = await git(repoPath, ['branch', '--list', 'new-feature']);
      expect(branches).toContain('new-feature');
    }

    // git worktree list reflects the new path and is clean of the old one
    const worktreeList = await git(repo1, ['worktree', 'list']);
    expect(worktreeList).toContain(path.join(newWorkspacePath, 'repo1'));
    expect(worktreeList).not.toContain(oldWorkspacePath);

    // Loose files (flow-config.json) carried over
    expect(fs.existsSync(path.join(newWorkspacePath, 'flow-config.json'))).toBe(true);

    // Should not have exited with an error code
    expect((integration.stubs.process.exit as sinon.SinonStub).called).toBe(false);
  });

  it('should auto-detect the workspace from the current directory when only one name is given', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const created = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    (integration.stubs.process.cwd as sinon.SinonStub).returns(created.workspacePath);

    await runRename(undefined, 'feature-b', integration.useCases, integration.services);

    expect(fs.existsSync(created.workspacePath)).toBe(false);
    expect(fs.existsSync(path.join(destPath, 'feature-b'))).toBe(true);
  });

  it('should preserve uncommitted changes in the worktree across the move', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    const created = await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const worktreePath = path.join(created.workspacePath, 'repo1');
    fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'work in progress\n');

    await runRename('old-feature', 'new-feature', integration.useCases, integration.services);

    const newWorktreePath = path.join(destPath, 'new-feature', 'repo1');
    expect(fs.readFileSync(path.join(newWorktreePath, 'dirty.txt'), 'utf-8')).toBe('work in progress\n');

    const status = await git(newWorktreePath, ['status', '--porcelain']);
    expect(status).toContain('dirty.txt');
  });

  it('should still relocate the whole workspace on partial failure, leaving the failed repo on its previous branch', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);
    const created = await createTestWorkspace(integration.useCases, {
      repos: [repo1, repo2],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Simulate repo2's source repo having been removed from source-path
    fs.rmSync(repo2, { recursive: true, force: true });

    await expect(
      runRename('old-feature', 'new-feature', integration.useCases, integration.services)
    ).rejects.toThrow(ProcessExitError);

    const newWorkspacePath = path.join(destPath, 'new-feature');

    // The workspace directory relocates as a single atomic move regardless of
    // per-repo failures — there's no "old location" left behind
    expect(fs.existsSync(created.workspacePath)).toBe(false);
    expect(fs.existsSync(newWorkspacePath)).toBe(true);

    // repo1 succeeded: relocated and switched to the new branch
    const repo1WorktreePath = path.join(newWorkspacePath, 'repo1');
    expect(fs.existsSync(repo1WorktreePath)).toBe(true);
    const repo1Branch = (
      await git(repo1WorktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    ).trim();
    expect(repo1Branch).toBe('new-feature');

    // repo2 failed (its source repo is gone) — its worktree directory still
    // moved along with the rest of the workspace, but was never touched by git
    expect(fs.existsSync(path.join(newWorkspacePath, 'repo2'))).toBe(true);

    // Error was reported
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0]);
    const errorLine = logCalls.find((line: string) => typeof line === 'string' && line.includes('repo2') && line.includes('error'));
    expect(errorLine).toBeDefined();
  });

  it('should rename the tmux session when tmux is enabled and a session exists', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);
    (integration.services.config.load as sinon.SinonStub).returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: true,
      postCheckout: undefined,
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      branchAutoSelectRepos: [],
      branchRepoUsage: {},
    });

    await createTestWorkspace(integration.useCases, {
      repos: [repo1],
      branchName: 'old-feature',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    tmuxStub.sessionExists.resolves(true);

    await runRename('old-feature', 'new-feature', integration.useCases, integration.services);

    sinon.assert.calledWith(tmuxStub.renameSession, 'old-feature', 'new-feature');

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0]);
    expect(logCalls.some((line: string) => typeof line === 'string' && line.includes('Renamed tmux session'))).toBe(
      true
    );
  });
});
