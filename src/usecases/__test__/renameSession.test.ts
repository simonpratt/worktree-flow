import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RenameSessionUseCase } from '../renameSession.js';
import { SessionManagers, type SessionManager } from '../../lib/sessionManager.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('RenameSessionUseCase', () => {
  let tmux: sinon.SinonStubbedInstance<SessionManager>;
  let herdr: sinon.SinonStubbedInstance<SessionManager>;
  let useCase: RenameSessionUseCase;

  beforeEach(() => {
    tmux = createMockSessionManager('tmux');
    herdr = createMockSessionManager('herdr');
    useCase = new RenameSessionUseCase(new SessionManagers({ tmux, herdr }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('renames the session with the configured session manager', async () => {
    const result = await useCase.execute({ sessionManager: 'herdr', oldName: 'old', newName: 'new' });

    sinon.assert.calledOnceWithExactly(herdr.rename, 'old', 'new');
    sinon.assert.notCalled(tmux.rename);
    expect(result.renamed).toBe(true);
  });

  it('reports no rename when there was no session', async () => {
    tmux.rename.resolves(false);

    const result = await useCase.execute({ sessionManager: 'tmux', oldName: 'old', newName: 'new' });

    expect(result.renamed).toBe(false);
  });

  it('does nothing when no session manager is configured', async () => {
    const result = await useCase.execute({ sessionManager: 'none', oldName: 'old', newName: 'new' });

    sinon.assert.notCalled(tmux.rename);
    sinon.assert.notCalled(herdr.rename);
    expect(result.renamed).toBe(false);
  });

  it('never throws, so a session failure cannot fail the surrounding rename', async () => {
    tmux.rename.rejects(new Error('tmux exploded'));

    const result = await useCase.execute({ sessionManager: 'tmux', oldName: 'old', newName: 'new' });

    expect(result.renamed).toBe(false);
  });
});
