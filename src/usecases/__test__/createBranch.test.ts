import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { CreateBranchUseCase } from '../createBranch.js';
import type { GitService } from '../../lib/git.js';

describe('CreateBranchUseCase', () => {
  let git: sinon.SinonStubbedInstance<GitService>;
  let useCase: CreateBranchUseCase;

  beforeEach(() => {
    git = {
      localRemoteBranchExists: sinon.stub(),
      remoteTrackingBranchExists: sinon.stub(),
      findFirstExistingBranch: sinon.stub(),
      createBranch: sinon.stub(),
    } as any;

    useCase = new CreateBranchUseCase(git);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates branch from specified source branch when it exists', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.createBranch.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'develop',
    });

    sinon.assert.calledOnce(git.createBranch);
    sinon.assert.calledWith(
      git.createBranch,
      '/source/my-repo',
      'feature/my-feature',
      'origin/develop'
    );
    expect(result.repoName).toBe('my-repo');
    expect(result.baseBranch).toBe('develop');
  });

  it('returns the actual base branch used', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.createBranch.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'develop',
    });

    expect(result.baseBranch).toBe('develop');
  });

  it('falls back to default branches when source branch does not exist', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'non-existent').resolves(false);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.findFirstExistingBranch.resolves('main');
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'main').resolves(true);
    git.createBranch.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'non-existent',
    });

    sinon.assert.calledWith(
      git.findFirstExistingBranch,
      '/source/my-repo',
      ['master', 'main', 'trunk', 'develop']
    );
    sinon.assert.calledWith(
      git.createBranch,
      '/source/my-repo',
      'feature/my-feature',
      'origin/main'
    );
    expect(result.baseBranch).toBe('main');
  });

  it('returns the fallback branch as the actual base branch used', async () => {
    git.localRemoteBranchExists.resolves(false);
    git.findFirstExistingBranch.resolves('master');
    git.remoteTrackingBranchExists.resolves(true);
    git.createBranch.resolves();

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'some-branch',
    });

    expect(result.baseBranch).toBe('master');
  });

  it('skips branch creation when the target branch already exists', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(true);

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'develop',
    });

    sinon.assert.notCalled(git.createBranch);
    expect(result.repoName).toBe('my-repo');
    expect(result.baseBranch).toBe('develop');
  });

  it('skips branch creation when the target branch already exists with fallback source', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'non-existent').resolves(false);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(true);
    git.findFirstExistingBranch.resolves('main');

    const result = await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'non-existent',
    });

    sinon.assert.notCalled(git.createBranch);
    expect(result.repoName).toBe('my-repo');
    expect(result.baseBranch).toBe('main');
  });

  it('throws when no fallback branch exists either', async () => {
    git.localRemoteBranchExists.resolves(false);
    git.findFirstExistingBranch.resolves(null);

    await expect(
      useCase.execute({
        repoPath: '/source/my-repo',
        branchName: 'feature/my-feature',
        sourceBranch: 'non-existent',
      })
    ).rejects.toThrow(
      'Cannot create branch in my-repo: source branch "non-existent" not found and no fallback branch exists'
    );

    sinon.assert.notCalled(git.createBranch);
  });

  it('does not call findFirstExistingBranch when source branch exists', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.createBranch.resolves();

    await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'develop',
    });

    sinon.assert.notCalled(git.findFirstExistingBranch);
  });

  it('uses local branch as start point when origin remote-tracking ref does not exist', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'develop').resolves(true);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'develop').resolves(false);
    git.createBranch.resolves();

    await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'develop',
    });

    sinon.assert.calledWith(
      git.createBranch,
      '/source/my-repo',
      'feature/my-feature',
      'develop'
    );
  });

  it('uses local fallback branch as start point when its origin remote-tracking ref does not exist', async () => {
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'non-existent').resolves(false);
    git.localRemoteBranchExists.withArgs('/source/my-repo', 'feature/my-feature').resolves(false);
    git.findFirstExistingBranch.resolves('main');
    git.remoteTrackingBranchExists.withArgs('/source/my-repo', 'main').resolves(false);
    git.createBranch.resolves();

    await useCase.execute({
      repoPath: '/source/my-repo',
      branchName: 'feature/my-feature',
      sourceBranch: 'non-existent',
    });

    sinon.assert.calledWith(
      git.createBranch,
      '/source/my-repo',
      'feature/my-feature',
      'main'
    );
  });
});
