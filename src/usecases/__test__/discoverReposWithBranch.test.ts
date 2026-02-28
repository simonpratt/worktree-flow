import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { DiscoverReposWithBranchUseCase } from '../discoverReposWithBranch.js';
import type { RepoService } from '../../lib/repos.js';
import { NoReposFoundError } from '../../lib/errors.js';

describe('DiscoverReposWithBranchUseCase', () => {
  let repos: sinon.SinonStubbedInstance<RepoService>;
  let useCase: DiscoverReposWithBranchUseCase;

  beforeEach(() => {
    repos = {
      discoverRepos: sinon.stub(),
      findReposWithBranch: sinon.stub(),
    } as any;

    useCase = new DiscoverReposWithBranchUseCase(repos);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should discover repos and return matching ones that have the branch', async () => {
    const allRepos = ['/source/repo1', '/source/repo2', '/source/repo3'];
    repos.discoverRepos.withArgs('/source').returns(allRepos);
    repos.findReposWithBranch.resolves({
      matching: ['/source/repo1', '/source/repo3'],
      results: [
        { repoPath: '/source/repo1', repoName: 'repo1', hasBranch: true },
        { repoPath: '/source/repo2', repoName: 'repo2', hasBranch: false },
        { repoPath: '/source/repo3', repoName: 'repo3', hasBranch: true },
      ],
    });

    const result = await useCase.execute({
      sourcePath: '/source',
      branchName: 'feature-branch',
    });

    expect(result.allRepos).toEqual(allRepos);
    expect(result.matchingRepos).toEqual(['/source/repo1', '/source/repo3']);
    expect(result.branchCheckResults).toHaveLength(3);
    sinon.assert.calledOnceWithExactly(repos.discoverRepos, '/source');
    sinon.assert.calledOnceWithExactly(repos.findReposWithBranch, allRepos, 'feature-branch');
  });

  it('should return empty matchingRepos when no repos have the branch', async () => {
    const allRepos = ['/source/repo1', '/source/repo2'];
    repos.discoverRepos.returns(allRepos);
    repos.findReposWithBranch.resolves({
      matching: [],
      results: [
        { repoPath: '/source/repo1', repoName: 'repo1', hasBranch: false },
        { repoPath: '/source/repo2', repoName: 'repo2', hasBranch: false },
      ],
    });

    const result = await useCase.execute({
      sourcePath: '/source',
      branchName: 'nonexistent-branch',
    });

    expect(result.allRepos).toEqual(allRepos);
    expect(result.matchingRepos).toEqual([]);
    expect(result.branchCheckResults).toHaveLength(2);
    expect(result.branchCheckResults.every(r => !r.hasBranch)).toBe(true);
  });

  it('should throw NoReposFoundError when source path has no repos', async () => {
    repos.discoverRepos.withArgs('/empty').returns([]);

    await expect(
      useCase.execute({ sourcePath: '/empty', branchName: 'feature-branch' })
    ).rejects.toThrow(NoReposFoundError);

    await expect(
      useCase.execute({ sourcePath: '/empty', branchName: 'feature-branch' })
    ).rejects.toThrow('No git repositories found in /empty');

    sinon.assert.notCalled(repos.findReposWithBranch);
  });

  it('should return branch check results including repos with errors', async () => {
    const allRepos = ['/source/repo1', '/source/repo2'];
    repos.discoverRepos.returns(allRepos);
    repos.findReposWithBranch.resolves({
      matching: ['/source/repo1'],
      results: [
        { repoPath: '/source/repo1', repoName: 'repo1', hasBranch: true },
        {
          repoPath: '/source/repo2',
          repoName: 'repo2',
          hasBranch: false,
          error: 'fatal: not a git repository',
        },
      ],
    });

    const result = await useCase.execute({
      sourcePath: '/source',
      branchName: 'feature-branch',
    });

    expect(result.matchingRepos).toEqual(['/source/repo1']);
    expect(result.branchCheckResults).toEqual([
      { repoPath: '/source/repo1', repoName: 'repo1', hasBranch: true },
      {
        repoPath: '/source/repo2',
        repoName: 'repo2',
        hasBranch: false,
        error: 'fatal: not a git repository',
      },
    ]);
  });
});
