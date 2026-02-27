import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { AddReposToWorkspaceUseCase } from '../addReposToWorkspace.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import type { WorktreeService } from '../../lib/worktree.js';
import type { GitService } from '../../lib/git.js';
import type { ParallelService } from '../../lib/parallel.js';
import type { RunPostCheckoutUseCase } from '../runPostCheckout.js';

describe('AddReposToWorkspaceUseCase', () => {
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let worktree: sinon.SinonStubbedInstance<WorktreeService>;
  let git: sinon.SinonStubbedInstance<GitService>;
  let parallel: sinon.SinonStubbedInstance<ParallelService>;
  let runPostCheckout: sinon.SinonStubbedInstance<RunPostCheckoutUseCase>;
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

    useCase = new AddReposToWorkspaceUseCase(
      workspaceConfig,
      worktree,
      git,
      parallel,
      runPostCheckout
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
});
