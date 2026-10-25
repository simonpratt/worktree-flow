import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { SwitchToWorkspaceUseCase } from '../switchToWorkspace.js';
import type { SessionManager } from '../../lib/sessionManager.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('SwitchToWorkspaceUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let sessions: sinon.SinonStubbedInstance<SessionManager>;
  let useCase: SwitchToWorkspaceUseCase;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub().callsFake((ws: string) => [`${ws}/repo1`, `${ws}/repo2`]),
    } as any;
    sessions = createMockSessionManager();
    useCase = new SwitchToWorkspaceUseCase(workspaceDir);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('only focuses a session that already exists', async () => {
    sessions.exists.withArgs('feature/a').resolves(true);

    const result = await useCase.execute({ sessions, workspacePath: '/dest/feature_a', sessionName: 'feature/a' });

    sinon.assert.notCalled(sessions.create);
    sinon.assert.calledOnceWithExactly(sessions.focus, 'feature/a');
    expect(result).toEqual({ created: false });
  });

  it('creates a missing session with a pane per worktree, then focuses it', async () => {
    const result = await useCase.execute({ sessions, workspacePath: '/dest/feature_a', sessionName: 'feature/a' });

    sinon.assert.calledOnceWithExactly(sessions.create, 'feature/a', '/dest/feature_a', [
      { path: '/dest/feature_a/repo1' },
      { path: '/dest/feature_a/repo2' },
    ]);
    sinon.assert.callOrder(sessions.create, sessions.focus);
    sinon.assert.calledOnceWithExactly(sessions.focus, 'feature/a');
    expect(result).toEqual({ created: true });
  });

  it('does not focus when the session cannot be created', async () => {
    sessions.create.rejects(new Error('tmux exploded'));

    await expect(
      useCase.execute({ sessions, workspacePath: '/dest/a', sessionName: 'a' })
    ).rejects.toThrow('tmux exploded');
    sinon.assert.notCalled(sessions.focus);
  });
});
