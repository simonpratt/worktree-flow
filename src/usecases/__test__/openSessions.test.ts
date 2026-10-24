import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { OpenSessionsUseCase } from '../openSessions.js';
import { SessionExistsError, type SessionManager } from '../../lib/sessionManager.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('OpenSessionsUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let sessions: sinon.SinonStubbedInstance<SessionManager>;
  let useCase: OpenSessionsUseCase;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub().callsFake((ws: string) => [`${ws}/repo1`, `${ws}/repo2`]),
    } as any;
    sessions = createMockSessionManager();
    useCase = new OpenSessionsUseCase(workspaceDir);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates a session per workspace with a pane per worktree', async () => {
    const result = await useCase.execute({
      sessions,
      workspaces: [
        { path: '/dest/a', sessionName: 'feature/a' },
        { path: '/dest/b', sessionName: 'b' },
      ],
    });

    sinon.assert.calledWith(sessions.create, 'feature/a', '/dest/a', [{ path: '/dest/a/repo1' }, { path: '/dest/a/repo2' }]);
    sinon.assert.calledWith(sessions.create, 'b', '/dest/b', [{ path: '/dest/b/repo1' }, { path: '/dest/b/repo2' }]);
    expect(result).toEqual({ sessionsCreated: 2, sessionsSkipped: 0, errors: [] });
  });

  it('counts sessions that already exist as skipped', async () => {
    sessions.create.onSecondCall().rejects(new SessionExistsError('b'));

    const result = await useCase.execute({
      sessions,
      workspaces: [
        { path: '/dest/a', sessionName: 'a' },
        { path: '/dest/b', sessionName: 'b' },
      ],
    });

    expect(result).toEqual({ sessionsCreated: 1, sessionsSkipped: 1, errors: [] });
  });

  it('collects other errors and carries on', async () => {
    sessions.create.onFirstCall().rejects(new Error('no space for new pane'));

    const result = await useCase.execute({
      sessions,
      workspaces: [
        { path: '/dest/a', sessionName: 'a' },
        { path: '/dest/b', sessionName: 'b' },
      ],
    });

    expect(result).toEqual({
      sessionsCreated: 1,
      sessionsSkipped: 0,
      errors: [{ workspace: 'a', error: 'no space for new pane' }],
    });
  });
});
