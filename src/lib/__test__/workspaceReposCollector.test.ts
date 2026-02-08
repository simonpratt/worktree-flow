import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { collectWorkspaceRepos } from '../workspaceReposCollector.js';
import type { WorkspaceDirectoryService } from '../workspaceDirectory.js';

describe('collectWorkspaceRepos', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub(),
    } as any;
  });

  it('should return empty arrays when no workspaces provided', () => {
    const result = collectWorkspaceRepos([], workspaceDir, '/source');

    expect(result.uniqueSourceRepos).toEqual([]);
    expect(result.workspaceWorktrees.size).toBe(0);
  });

  it('should collect worktrees and source repos for single workspace', () => {
    const workspaces = [
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 2 },
    ];

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    const result = collectWorkspaceRepos(workspaces, workspaceDir, '/source');

    expect(result.uniqueSourceRepos).toEqual(['/source/repo1', '/source/repo2']);
    expect(result.workspaceWorktrees.get('/dest/feature-a')).toEqual([
      '/dest/feature-a/repo1',
      '/dest/feature-a/repo2',
    ]);
  });

  it('should deduplicate source repos across multiple workspaces', () => {
    const workspaces = [
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 1 },
    ];

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-b')
      .returns(['/dest/feature-b/repo1']);

    const result = collectWorkspaceRepos(workspaces, workspaceDir, '/source');

    // Should only have repo1 once in unique source repos
    expect(result.uniqueSourceRepos).toEqual(['/source/repo1']);
    expect(result.workspaceWorktrees.size).toBe(2);
  });

  it('should handle workspaces with no worktrees', () => {
    const workspaces = [
      { name: 'empty', path: '/dest/empty', repoCount: 0 },
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
    ];

    workspaceDir.getWorktreeDirs.withArgs('/dest/empty').returns([]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    const result = collectWorkspaceRepos(workspaces, workspaceDir, '/source');

    expect(result.uniqueSourceRepos).toEqual(['/source/repo1']);
    expect(result.workspaceWorktrees.has('/dest/empty')).toBe(false);
    expect(result.workspaceWorktrees.has('/dest/feature-a')).toBe(true);
  });

  it('should handle multiple workspaces with different repos', () => {
    const workspaces = [
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 2 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 2 },
    ];

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-b')
      .returns(['/dest/feature-b/repo2', '/dest/feature-b/repo3']);

    const result = collectWorkspaceRepos(workspaces, workspaceDir, '/source');

    // Should have all three unique repos
    expect(result.uniqueSourceRepos).toHaveLength(3);
    expect(result.uniqueSourceRepos).toContain('/source/repo1');
    expect(result.uniqueSourceRepos).toContain('/source/repo2');
    expect(result.uniqueSourceRepos).toContain('/source/repo3');

    expect(result.workspaceWorktrees.size).toBe(2);
    expect(result.workspaceWorktrees.get('/dest/feature-a')).toHaveLength(2);
    expect(result.workspaceWorktrees.get('/dest/feature-b')).toHaveLength(2);
  });
});
