import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { AddToWorkspaceUseCase } from '../addToWorkspace.js';
import type { WorktreeService } from '../../lib/worktree.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import type { RepoConfigService } from '../../lib/repoConfig.js';
import type { PostCheckoutService } from '../../lib/postCheckout.js';
import type { TmuxService } from '../../lib/tmux.js';

describe('AddToWorkspaceUseCase', () => {
  let worktree: sinon.SinonStubbedInstance<WorktreeService>;
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let repoConfig: sinon.SinonStubbedInstance<RepoConfigService>;
  let postCheckout: sinon.SinonStubbedInstance<PostCheckoutService>;
  let tmux: sinon.SinonStubbedInstance<TmuxService>;
  let useCase: AddToWorkspaceUseCase;

  beforeEach(() => {
    worktree = {
      createWorktreeCheckout: sinon.stub(),
      copyConfigFilesToWorktree: sinon.stub(),
    } as any;
    workspaceConfig = {
      save: sinon.stub(),
    } as any;
    repoConfig = {
      load: sinon.stub(),
      resolveCopyFiles: sinon.stub(),
      resolvePostCheckout: sinon.stub(),
    } as any;
    postCheckout = {
      runCommandInDirectory: sinon.stub(),
    } as any;
    tmux = {
      addPane: sinon.stub(),
      sendKeysToPane: sinon.stub(),
    } as any;

    useCase = new AddToWorkspaceUseCase(worktree, workspaceConfig, repoConfig, postCheckout, tmux);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates worktree by checking out existing branch', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
    });

    sinon.assert.calledOnceWithExactly(
      worktree.createWorktreeCheckout,
      '/source/my-repo',
      '/dest/feature/my-repo',
      'feature/my-feature'
    );
    expect(result.repoName).toBe('my-repo');
    expect(result.worktreePath).toBe('/dest/feature/my-repo');
  });

  it('copies config files with repo-level overrides when repo has flow-config.json', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.withArgs('/source/my-repo').returns({ copyFiles: '.env,.env.local', postCheckout: undefined });
    repoConfig.resolveCopyFiles.returns('.env,.env.local');

    await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      copyFiles: '.env',
    });

    sinon.assert.calledOnceWithExactly(repoConfig.load, '/source/my-repo');
    sinon.assert.calledOnceWithExactly(
      repoConfig.resolveCopyFiles,
      { copyFiles: '.env,.env.local', postCheckout: undefined },
      '.env'
    );
    sinon.assert.calledOnceWithExactly(
      worktree.copyConfigFilesToWorktree,
      '/source/my-repo',
      '/dest/feature/my-repo',
      '.env,.env.local'
    );
  });

  it('copies config files with global fallback when no repo config', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.withArgs('/source/my-repo').returns(undefined);
    repoConfig.resolveCopyFiles.returns('.env');

    await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      copyFiles: '.env',
    });

    sinon.assert.calledOnceWithExactly(repoConfig.resolveCopyFiles, undefined, '.env');
    sinon.assert.calledOnceWithExactly(
      worktree.copyConfigFilesToWorktree,
      '/source/my-repo',
      '/dest/feature/my-repo',
      '.env'
    );
  });

  it('saves base branch to workspace config', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);

    await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
    });

    sinon.assert.calledOnceWithExactly(workspaceConfig.save, '/dest/feature', {
      baseBranches: { 'my-repo': 'main' },
    });
  });

  it('adds tmux pane when session name is provided', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);
    tmux.addPane.resolves(2);

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      sessionName: 'feature',
    });

    sinon.assert.calledOnceWithExactly(tmux.addPane, 'feature', '/dest/feature/my-repo');
    expect(result.tmuxPaneAdded).toBe(true);
  });

  it('does not add tmux pane when no session name is provided', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
    });

    sinon.assert.notCalled(tmux.addPane);
    expect(result.tmuxPaneAdded).toBe(false);
  });

  it('runs post-checkout command via PostCheckoutService when tmux is disabled', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);
    postCheckout.runCommandInDirectory.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      postCheckout: 'npm ci',
    });

    sinon.assert.calledOnceWithExactly(
      postCheckout.runCommandInDirectory,
      '/dest/feature/my-repo',
      'npm ci'
    );
    sinon.assert.notCalled(tmux.sendKeysToPane);
    expect(result.postCheckoutRan).toBe(true);
    expect(result.postCheckoutSuccess).toBe(true);
  });

  it('sends post-checkout command to tmux pane when tmux is enabled', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);
    tmux.addPane.resolves(3);
    tmux.sendKeysToPane.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      sessionName: 'feature',
      postCheckout: 'npm ci',
    });

    sinon.assert.calledOnceWithExactly(tmux.sendKeysToPane, 'feature', 3, 'npm ci');
    sinon.assert.notCalled(postCheckout.runCommandInDirectory);
    expect(result.postCheckoutRan).toBe(true);
    expect(result.postCheckoutSuccess).toBe(true);
  });

  it('handles post-checkout failure gracefully and returns postCheckoutSuccess: false', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);
    postCheckout.runCommandInDirectory.rejects(new Error('command failed'));

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
      postCheckout: 'npm ci',
    });

    expect(result.postCheckoutRan).toBe(true);
    expect(result.postCheckoutSuccess).toBe(false);
  });

  it('skips post-checkout when no command is configured', async () => {
    worktree.createWorktreeCheckout.resolves();
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns(undefined);

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      workspacePath: '/dest/feature',
      branchName: 'feature/my-feature',
      baseBranch: 'main',
    });

    sinon.assert.notCalled(postCheckout.runCommandInDirectory);
    sinon.assert.notCalled(tmux.sendKeysToPane);
    expect(result.postCheckoutRan).toBe(false);
    expect(result.postCheckoutSuccess).toBe(false);
  });
});
