import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { ListWorkspacesWithStatusUseCase } from '../listWorkspacesWithStatus.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { StatusService } from '../../lib/status.js';
import type { WorktreeStatus } from '../../lib/status.js';

describe('ListWorkspacesWithStatusUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let status: sinon.SinonStubbedInstance<StatusService>;
  let useCase: ListWorkspacesWithStatusUseCase;

  const cleanStatus: WorktreeStatus = { type: 'clean', untracked: 0, uncommitted: 0, unpushed: 0 };
  const dirtyStatus: WorktreeStatus = { type: 'dirty', untracked: 2, uncommitted: 1, unpushed: 0 };

  beforeEach(() => {
    workspaceDir = {
      listWorkspaces: sinon.stub(),
      getWorktreeDirs: sinon.stub(),
      detectWorkspace: sinon.stub(),
    } as any;

    status = {
      checkAllWorktrees: sinon.stub(),
    } as any;

    useCase = new ListWorkspacesWithStatusUseCase(workspaceDir, status);
  });

  it('should return empty array when no workspaces exist', async () => {
    workspaceDir.listWorkspaces.returns([]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest',
    });

    expect(result.workspaces).toEqual([]);
  });

  it('should check status for all workspaces', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 2 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    workspaceDir.detectWorkspace.returns(null);

    status.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: cleanStatus },
      { repoName: 'repo2', status: cleanStatus },
    ]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest',
    });

    sinon.assert.calledOnce(status.checkAllWorktrees);

    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0]).toMatchObject({
      name: 'feature-a',
      path: '/dest/feature-a',
      repoCount: 2,
      isActive: false,
    });
    expect(result.workspaces[0].statuses).toHaveLength(2);
  });

  it('should mark workspace as active when cwd is inside it', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    workspaceDir.detectWorkspace
      .withArgs('/dest/feature-a/repo1', '/dest')
      .returns('/dest/feature-a');

    status.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: cleanStatus },
    ]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest/feature-a/repo1',
    });

    expect(result.workspaces[0].isActive).toBe(true);
  });

  it('should handle multiple workspaces with same repo names', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-b')
      .returns(['/dest/feature-b/repo1']);

    workspaceDir.detectWorkspace.returns(null);

    status.checkAllWorktrees.resolves([
      { repoName: 'repo1', status: cleanStatus },
    ]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest',
    });

    // Should check status for each workspace separately
    expect(result.workspaces).toHaveLength(2);
  });

  it('should skip workspaces with no worktrees', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'empty', path: '/dest/empty', repoCount: 0 },
    ]);

    workspaceDir.getWorktreeDirs.withArgs('/dest/empty').returns([]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest',
    });

    expect(result.workspaces).toEqual([]);
    sinon.assert.notCalled(status.checkAllWorktrees);
  });

  it('should handle multiple workspaces with different statuses', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'clean-workspace', path: '/dest/clean-workspace', repoCount: 1 },
      { name: 'dirty-workspace', path: '/dest/dirty-workspace', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/clean-workspace')
      .returns(['/dest/clean-workspace/repo1']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/dirty-workspace')
      .returns(['/dest/dirty-workspace/repo2']);

    workspaceDir.detectWorkspace.returns(null);

    status.checkAllWorktrees
      .onFirstCall()
      .resolves([{ repoName: 'repo1', status: cleanStatus }]);

    status.checkAllWorktrees
      .onSecondCall()
      .resolves([{ repoName: 'repo2', status: dirtyStatus }]);

    const result = await useCase.execute({
      destPath: '/dest',
      sourcePath: '/source',
      cwd: '/dest',
    });

    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces[0].statuses[0].status.type).toBe('clean');
    expect(result.workspaces[1].statuses[0].status.type).toBe('dirty');
  });
});
