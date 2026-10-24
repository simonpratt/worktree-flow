import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RenameTmuxSessionUseCase } from '../renameTmuxSession.js';
import type { TmuxService } from '../../lib/tmux.js';

describe('RenameTmuxSessionUseCase', () => {
  let useCase: RenameTmuxSessionUseCase;
  let tmuxStub: sinon.SinonStubbedInstance<TmuxService>;

  beforeEach(() => {
    tmuxStub = {
      sessionExists: sinon.stub().resolves(false),
      renameSession: sinon.stub().resolves(),
    } as any;

    useCase = new RenameTmuxSessionUseCase(tmuxStub as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should rename the session when it exists', async () => {
    tmuxStub.sessionExists.resolves(true);

    const result = await useCase.execute({ oldName: 'old-feature', newName: 'new-feature' });

    sinon.assert.calledOnceWithExactly(tmuxStub.renameSession, 'old-feature', 'new-feature');
    expect(result.renamed).toBe(true);
  });

  it('should not attempt a rename when no session exists', async () => {
    const result = await useCase.execute({ oldName: 'old-feature', newName: 'new-feature' });

    expect(tmuxStub.renameSession.called).toBe(false);
    expect(result.renamed).toBe(false);
  });

  it('should report not renamed rather than throw when tmux fails', async () => {
    tmuxStub.sessionExists.resolves(true);
    tmuxStub.renameSession.rejects(new Error('tmux error'));

    const result = await useCase.execute({ oldName: 'old-feature', newName: 'new-feature' });

    expect(result.renamed).toBe(false);
  });
});
