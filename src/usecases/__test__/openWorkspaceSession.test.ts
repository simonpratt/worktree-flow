import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { OpenWorkspaceSessionUseCase } from '../openWorkspaceSession.js';
import { SessionManagers, type SessionManager } from '../../lib/sessionManager.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { PostCheckoutService } from '../../lib/postCheckout.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('OpenWorkspaceSessionUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let postCheckout: sinon.SinonStubbedInstance<PostCheckoutService>;
  let tmux: sinon.SinonStubbedInstance<SessionManager>;
  let herdr: sinon.SinonStubbedInstance<SessionManager>;
  let useCase: OpenWorkspaceSessionUseCase;

  const workspacePath = '/dest/feature';

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub().returns([`${workspacePath}/api`, `${workspacePath}/web`]),
    } as any;
    postCheckout = {
      runCommandInDirectory: sinon.stub().resolves(),
    } as any;
    tmux = createMockSessionManager('tmux');
    herdr = createMockSessionManager('herdr');

    useCase = new OpenWorkspaceSessionUseCase(workspaceDir, postCheckout, new SessionManagers({ tmux, herdr }));
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('with no session manager', () => {
    it('runs post-checkout commands directly in each worktree', async () => {
      const result = await useCase.execute({
        sessionManager: 'none',
        workspacePath,
        sessionName: 'feature/x',
        panes: [
          { path: `${workspacePath}/api`, command: 'npm ci' },
          { path: `${workspacePath}/web` },
        ],
      });

      sinon.assert.calledOnceWithExactly(postCheckout.runCommandInDirectory, `${workspacePath}/api`, 'npm ci');
      expect(result).toEqual({
        session: 'none',
        sessionError: undefined,
        postCheckout: [{ path: `${workspacePath}/api`, success: true }],
      });
    });

    it('reports a failed command', async () => {
      postCheckout.runCommandInDirectory.rejects(new Error('exit 1'));

      const result = await useCase.execute({
        sessionManager: 'none',
        workspacePath,
        sessionName: 'feature/x',
        panes: [{ path: `${workspacePath}/api`, command: 'npm ci' }],
      });

      expect(result.postCheckout).toEqual([{ path: `${workspacePath}/api`, success: false }]);
    });
  });

  describe('with a session manager', () => {
    it('creates the session with every worktree in the workspace, running commands only for the new panes', async () => {
      const result = await useCase.execute({
        sessionManager: 'herdr',
        workspacePath,
        sessionName: 'feature/x',
        panes: [{ path: `${workspacePath}/web`, command: 'npm ci' }],
      });

      sinon.assert.calledOnceWithExactly(herdr.create, 'feature/x', workspacePath, [
        { path: `${workspacePath}/api`, command: undefined },
        { path: `${workspacePath}/web`, command: 'npm ci' },
      ]);
      sinon.assert.notCalled(tmux.create);
      sinon.assert.notCalled(postCheckout.runCommandInDirectory);
      expect(result).toEqual({
        session: 'created',
        postCheckout: [{ path: `${workspacePath}/web`, success: true }],
      });
    });

    it('adds only the new panes to an existing session', async () => {
      tmux.exists.withArgs('feature/x').resolves(true);

      const result = await useCase.execute({
        sessionManager: 'tmux',
        workspacePath,
        sessionName: 'feature/x',
        panes: [{ path: `${workspacePath}/web`, command: 'npm ci' }],
      });

      sinon.assert.notCalled(tmux.create);
      sinon.assert.calledOnceWithExactly(tmux.addPanes, 'feature/x', [{ path: `${workspacePath}/web`, command: 'npm ci' }]);
      expect(result.session).toBe('extended');
      expect(result.postCheckout).toEqual([{ path: `${workspacePath}/web`, success: true }]);
    });

    it('passes through commands the session manager failed to send', async () => {
      tmux.create.resolves([{ path: `${workspacePath}/api`, success: false }]);

      const result = await useCase.execute({
        sessionManager: 'tmux',
        workspacePath,
        sessionName: 'feature/x',
        panes: [{ path: `${workspacePath}/api`, command: 'npm ci' }],
      });

      expect(result.postCheckout).toEqual([{ path: `${workspacePath}/api`, success: false }]);
      sinon.assert.notCalled(postCheckout.runCommandInDirectory);
    });

    it('falls back to running commands directly when the session cannot be opened', async () => {
      herdr.create.rejects(new Error('Timed out waiting for the herdr server to start'));

      const result = await useCase.execute({
        sessionManager: 'herdr',
        workspacePath,
        sessionName: 'feature/x',
        panes: [{ path: `${workspacePath}/api`, command: 'npm ci' }],
      });

      sinon.assert.calledOnceWithExactly(postCheckout.runCommandInDirectory, `${workspacePath}/api`, 'npm ci');
      expect(result).toEqual({
        session: 'failed',
        sessionError: 'Timed out waiting for the herdr server to start',
        postCheckout: [{ path: `${workspacePath}/api`, success: true }],
      });
    });
  });
});
