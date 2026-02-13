import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { ResumeTmuxSessionsUseCase } from '../resumeTmuxSessions.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { TmuxService } from '../../lib/tmux.js';

describe('ResumeTmuxSessionsUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let tmux: sinon.SinonStubbedInstance<TmuxService>;
  let useCase: ResumeTmuxSessionsUseCase;

  beforeEach(() => {
    workspaceDir = {
      listWorkspaces: sinon.stub(),
      getWorktreeDirs: sinon.stub(),
    } as any;

    tmux = {
      createSession: sinon.stub(),
    } as any;

    useCase = new ResumeTmuxSessionsUseCase(workspaceDir, tmux);
  });

  it('should return zero counts when no workspaces exist', async () => {
    workspaceDir.listWorkspaces.returns([]);

    const result = await useCase.execute({ destPath: '/dest' });

    expect(result).toEqual({
      totalWorkspaces: 0,
      sessionsCreated: 0,
      sessionsSkipped: 0,
      errors: [],
    });
    sinon.assert.notCalled(tmux.createSession);
  });

  it('should create tmux sessions for all workspaces', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 2 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns(['/dest/feature-a/repo1', '/dest/feature-a/repo2']);

    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-b')
      .returns(['/dest/feature-b/repo1']);

    tmux.createSession.resolves();

    const result = await useCase.execute({ destPath: '/dest' });

    expect(result).toEqual({
      totalWorkspaces: 2,
      sessionsCreated: 2,
      sessionsSkipped: 0,
      errors: [],
    });

    sinon.assert.calledTwice(tmux.createSession);
    sinon.assert.calledWith(
      tmux.createSession,
      '/dest/feature-a',
      'feature-a',
      ['/dest/feature-a/repo1', '/dest/feature-a/repo2']
    );
    sinon.assert.calledWith(
      tmux.createSession,
      '/dest/feature-b',
      'feature-b',
      ['/dest/feature-b/repo1']
    );
  });

  it('should skip workspaces with existing tmux sessions', async () => {
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

    // First call succeeds, second throws duplicate session error
    tmux.createSession.onFirstCall().resolves();
    tmux.createSession.onSecondCall().rejects(new Error('duplicate session: feature-b'));

    const result = await useCase.execute({ destPath: '/dest' });

    expect(result).toEqual({
      totalWorkspaces: 2,
      sessionsCreated: 1,
      sessionsSkipped: 1,
      errors: [],
    });
  });

  it('should handle errors during session creation', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 1 },
      { name: 'feature-b', path: '/dest/feature-b', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs.returns(['/dest/feature-a/repo1']);

    tmux.createSession.onFirstCall().rejects(new Error('tmux not installed'));
    tmux.createSession.onSecondCall().resolves();

    const result = await useCase.execute({ destPath: '/dest' });

    expect(result).toEqual({
      totalWorkspaces: 2,
      sessionsCreated: 1,
      sessionsSkipped: 0,
      errors: [{ workspace: 'feature-a', error: 'tmux not installed' }],
    });
  });

  it('should handle mix of created, skipped, and errors', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'new-session', path: '/dest/new-session', repoCount: 1 },
      { name: 'existing-session', path: '/dest/existing-session', repoCount: 1 },
      { name: 'error-session', path: '/dest/error-session', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs.returns(['/dest/repo']);

    tmux.createSession.onCall(0).resolves();
    tmux.createSession.onCall(1).rejects(new Error('duplicate session: existing-session'));
    tmux.createSession.onCall(2).rejects(new Error('permission denied'));

    const result = await useCase.execute({ destPath: '/dest' });

    expect(result).toEqual({
      totalWorkspaces: 3,
      sessionsCreated: 1,
      sessionsSkipped: 1,
      errors: [{ workspace: 'error-session', error: 'permission denied' }],
    });
  });

  it('should pass workspace name as tmux session name', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'my-feature-branch', path: '/dest/my-feature-branch', repoCount: 1 },
    ]);

    workspaceDir.getWorktreeDirs.returns(['/dest/my-feature-branch/repo1']);

    tmux.createSession.resolves();

    await useCase.execute({ destPath: '/dest' });

    sinon.assert.calledOnce(tmux.createSession);
    sinon.assert.calledWith(
      tmux.createSession,
      '/dest/my-feature-branch',
      'my-feature-branch',
      ['/dest/my-feature-branch/repo1']
    );
  });

  it('should include all git directories returned by getWorktreeDirs', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature-a', path: '/dest/feature-a', repoCount: 3 },
    ]);

    // getWorktreeDirs now only returns directories with .git, so all returned dirs are valid
    workspaceDir.getWorktreeDirs
      .withArgs('/dest/feature-a')
      .returns([
        '/dest/feature-a/repo1',
        '/dest/feature-a/repo2',
        '/dest/feature-a/repo3',
      ]);

    tmux.createSession.resolves();

    await useCase.execute({ destPath: '/dest' });

    sinon.assert.calledOnce(tmux.createSession);
    // Should include all directories returned by getWorktreeDirs
    sinon.assert.calledWith(
      tmux.createSession,
      '/dest/feature-a',
      'feature-a',
      ['/dest/feature-a/repo1', '/dest/feature-a/repo2', '/dest/feature-a/repo3']
    );
  });
});
