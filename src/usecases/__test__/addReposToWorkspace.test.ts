import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { AddReposToWorkspaceUseCase } from '../addReposToWorkspace.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import type { WorktreeService } from '../../lib/worktree.js';
import type { GitService } from '../../lib/git.js';
import type { ParallelService } from '../../lib/parallel.js';
import type { RunPostCheckoutUseCase } from '../runPostCheckout.js';
import type { RepoConfigService } from '../../lib/repoConfig.js';

describe('AddReposToWorkspaceUseCase', () => {
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let worktree: sinon.SinonStubbedInstance<WorktreeService>;
  let git: sinon.SinonStubbedInstance<GitService>;
  let parallel: sinon.SinonStubbedInstance<ParallelService>;
  let runPostCheckout: sinon.SinonStubbedInstance<RunPostCheckoutUseCase>;
  let repoConfig: sinon.SinonStubbedInstance<RepoConfigService>;
  let useCase: AddReposToWorkspaceUseCase;

  beforeEach(() => {
    workspaceConfig = {
      save: sinon.stub(),
      getBaseBranch: sinon.stub(),
    } as any;
    worktree = {
      createWorktreeWithBranch: sinon.stub(),
      copyConfigFilesToWorktree: sinon.stub(),
    } as any;
    git = {
      localRemoteBranchExists: sinon.stub(),
      findFirstExistingBranch: sinon.stub(),
      getCurrentBranch: sinon.stub(),
    } as any;
    parallel = {
      processInParallel: sinon.stub(),
    } as any;
    runPostCheckout = {
      execute: sinon.stub(),
    } as any;
    repoConfig = {
      load: sinon.stub(),
      resolvePostCheckout: sinon.stub(),
      resolveCopyFiles: sinon.stub(),
    } as any;

    useCase = new AddReposToWorkspaceUseCase(
      workspaceConfig,
      worktree,
      git,
      parallel,
      runPostCheckout,
      repoConfig
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create worktrees for selected repos in existing workspace', async () => {
    parallel.processInParallel.resolves(2);
    runPostCheckout.execute.resolves(undefined);

    const result = await useCase.execute({
      repos: ['/source/repo1', '/source/repo2'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env',
    });

    expect(result.successCount).toBe(2);
    expect(result.totalCount).toBe(2);
    sinon.assert.calledOnce(parallel.processInParallel);
    sinon.assert.calledOnce(workspaceConfig.save);
  });

  it('should save base branches to workspace config', async () => {
    // Simulate the parallel processor calling the task fn
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      await taskFn('/source/repo2');
      return 2;
    });
    git.localRemoteBranchExists.resolves(true);
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves(undefined);

    await useCase.execute({
      repos: ['/source/repo1', '/source/repo2'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env',
    });

    sinon.assert.calledOnce(workspaceConfig.save);
    const savedConfig = workspaceConfig.save.firstCall.args[1];
    expect(savedConfig.baseBranches).toEqual({
      repo1: 'master',
      repo2: 'master',
    });
  });

  it('should fall back to default branches when source branch does not exist', async () => {
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      return 1;
    });
    git.localRemoteBranchExists.resolves(false);
    git.findFirstExistingBranch.resolves('main');
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves(undefined);

    await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'develop',
      copyFiles: '.env',
    });

    const savedConfig = workspaceConfig.save.firstCall.args[1];
    expect(savedConfig.baseBranches).toEqual({ repo1: 'main' });
  });

  it('should copy config files to worktrees', async () => {
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      return 1;
    });
    git.localRemoteBranchExists.resolves(true);
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves(undefined);
    repoConfig.load.returns(undefined);
    repoConfig.resolveCopyFiles.returns('.env,.eslintrc');

    await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env,.eslintrc',
    });

    sinon.assert.calledOnce(worktree.copyConfigFilesToWorktree);
    sinon.assert.calledWith(
      worktree.copyConfigFilesToWorktree,
      '/source/repo1',
      '/dest/feature/repo1',
      '.env,.eslintrc'
    );
  });

  it('should run post-checkout when configured', async () => {
    parallel.processInParallel.resolves(1);
    runPostCheckout.execute.resolves({ successCount: 1, totalCount: 1 });
    repoConfig.load.returns(undefined);
    repoConfig.resolvePostCheckout.returns('yarn install');

    const result = await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      postCheckout: 'npm ci',
      perRepoPostCheckout: { repo1: 'yarn install' },
    });

    sinon.assert.calledOnce(runPostCheckout.execute);
    sinon.assert.calledWith(runPostCheckout.execute, sinon.match({
      workspacePath: '/dest/feature',
      tmuxEnabled: false,
      postCheckout: 'npm ci',
      perRepoPostCheckout: { repo1: 'yarn install' },
    }));
    expect(result.postCheckoutSuccess).toBe(1);
    expect(result.postCheckoutTotal).toBe(1);
  });

  it('should not run post-checkout when not configured', async () => {
    parallel.processInParallel.resolves(1);
    runPostCheckout.execute.resolves(undefined);

    const result = await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
    });

    sinon.assert.calledOnce(runPostCheckout.execute);
    expect(result.postCheckoutSuccess).toBeUndefined();
    expect(result.postCheckoutTotal).toBeUndefined();
  });

  it('should detect branch name from worktree when not provided', async () => {
    parallel.processInParallel.resolves(1);
    runPostCheckout.execute.resolves(undefined);
    git.getCurrentBranch.resolves('feature-xyz');

    const result = await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature-xyz',
      sourceBranch: 'master',
    });

    expect(result.totalCount).toBe(1);
    // branchName should be derived from workspace path basename
  });

  it('should use repo-level copy-files when flow-config.json specifies them', async () => {
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      return 1;
    });
    git.localRemoteBranchExists.resolves(true);
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves(undefined);
    repoConfig.load.withArgs('/source/repo1').returns({ copyFiles: '.env,.env.local', postCheckout: undefined });
    repoConfig.resolveCopyFiles.returns('.env,.env.local');

    await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env',
    });

    sinon.assert.calledOnce(worktree.copyConfigFilesToWorktree);
    sinon.assert.calledWith(
      worktree.copyConfigFilesToWorktree,
      '/source/repo1',
      '/dest/feature/repo1',
      '.env,.env.local'
    );
  });

  it('should use global copy-files when repo has no flow-config.json', async () => {
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      return 1;
    });
    git.localRemoteBranchExists.resolves(true);
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves(undefined);
    repoConfig.load.withArgs('/source/repo1').returns(undefined);
    repoConfig.resolveCopyFiles.returns('.env');

    await useCase.execute({
      repos: ['/source/repo1'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env',
    });

    sinon.assert.calledOnce(worktree.copyConfigFilesToWorktree);
    sinon.assert.calledWith(
      worktree.copyConfigFilesToWorktree,
      '/source/repo1',
      '/dest/feature/repo1',
      '.env'
    );
  });

  it('should pass resolved per-repo post-checkout commands to RunPostCheckoutUseCase', async () => {
    parallel.processInParallel.callsFake(async (_items: any, _label: any, taskFn: any) => {
      await taskFn('/source/repo1');
      await taskFn('/source/repo2');
      await taskFn('/source/repo3');
      return 3;
    });
    git.localRemoteBranchExists.resolves(true);
    worktree.createWorktreeWithBranch.resolves();
    runPostCheckout.execute.resolves({ successCount: 3, totalCount: 3 });

    // repo1: has central per-repo override
    // repo2: has repo-level flow-config.json post-checkout
    // repo3: uses global fallback
    repoConfig.load.withArgs('/source/repo1').returns(undefined);
    repoConfig.load.withArgs('/source/repo2').returns({ copyFiles: undefined, postCheckout: 'yarn install' });
    repoConfig.load.withArgs('/source/repo3').returns(undefined);

    repoConfig.resolveCopyFiles.returns('.env');
    repoConfig.resolvePostCheckout.withArgs('repo1', { repo1: 'custom-cmd' }, undefined, 'npm ci').returns('custom-cmd');
    repoConfig.resolvePostCheckout.withArgs('repo2', { repo1: 'custom-cmd' }, { copyFiles: undefined, postCheckout: 'yarn install' }, 'npm ci').returns('yarn install');
    repoConfig.resolvePostCheckout.withArgs('repo3', { repo1: 'custom-cmd' }, undefined, 'npm ci').returns('npm ci');

    const result = await useCase.execute({
      repos: ['/source/repo1', '/source/repo2', '/source/repo3'],
      workspacePath: '/dest/feature',
      branchName: 'feature',
      sourceBranch: 'master',
      copyFiles: '.env',
      postCheckout: 'npm ci',
      perRepoPostCheckout: { repo1: 'custom-cmd' },
    });

    sinon.assert.calledOnce(runPostCheckout.execute);
    const postCheckoutArgs = runPostCheckout.execute.firstCall.args[0];
    expect(postCheckoutArgs.perRepoPostCheckout).toEqual({
      repo1: 'custom-cmd',
      repo2: 'yarn install',
      repo3: 'npm ci',
    });
    expect(postCheckoutArgs.postCheckout).toBe('npm ci');
    expect(result.postCheckoutSuccess).toBe(3);
  });
});
