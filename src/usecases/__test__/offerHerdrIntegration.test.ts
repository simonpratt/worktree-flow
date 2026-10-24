import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { OfferHerdrIntegrationUseCase } from '../offerHerdrIntegration.js';
import type { ConfigService } from '../../lib/config.js';
import type { HerdrService } from '../../lib/herdr.js';
import { PromptCancelledError } from '../../lib/errors.js';

describe('OfferHerdrIntegrationUseCase', () => {
  let config: sinon.SinonStubbedInstance<ConfigService>;
  let herdr: sinon.SinonStubbedInstance<HerdrService>;
  let confirm: sinon.SinonStub;
  let useCase: OfferHerdrIntegrationUseCase;

  const loadConfig = (overrides: Record<string, unknown> = {}) =>
    config.load.returns({ sessionManager: 'none', herdrPrompted: false, ...overrides } as any);

  beforeEach(() => {
    config = { load: sinon.stub(), set: sinon.stub() } as any;
    herdr = { isInstalled: sinon.stub().resolves(true) } as any;
    confirm = sinon.stub().resolves(true);
    loadConfig();

    useCase = new OfferHerdrIntegrationUseCase(config, herdr);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('enables herdr and uses it for this operation when the user accepts', async () => {
    const result = await useCase.execute({ confirm });

    sinon.assert.calledOnce(confirm);
    sinon.assert.calledOnceWithExactly(config.set, { 'session-manager': 'herdr', 'herdr-prompted': 'true' });
    expect(result).toEqual({ sessionManager: 'herdr', enabled: true });
  });

  it('remembers a decline so the user is not asked again', async () => {
    confirm.resolves(false);

    const result = await useCase.execute({ confirm });

    sinon.assert.calledOnceWithExactly(config.set, { 'herdr-prompted': 'true' });
    expect(result).toEqual({ sessionManager: 'none', enabled: false });
  });

  it('does not ask again once the user has been asked', async () => {
    loadConfig({ herdrPrompted: true });

    const result = await useCase.execute({ confirm });

    sinon.assert.notCalled(confirm);
    sinon.assert.notCalled(config.set);
    expect(result).toEqual({ sessionManager: 'none', enabled: false });
  });

  it('does not ask when herdr is not installed', async () => {
    herdr.isInstalled.resolves(false);

    const result = await useCase.execute({ confirm });

    sinon.assert.notCalled(confirm);
    sinon.assert.notCalled(config.set);
    expect(result).toEqual({ sessionManager: 'none', enabled: false });
  });

  it('does not ask, or check for herdr, when a session manager is already configured', async () => {
    loadConfig({ sessionManager: 'tmux' });

    const result = await useCase.execute({ confirm });

    sinon.assert.notCalled(herdr.isInstalled);
    sinon.assert.notCalled(confirm);
    expect(result).toEqual({ sessionManager: 'tmux', enabled: false });
  });

  it('asks again next time if the prompt is cancelled', async () => {
    confirm.rejects(new PromptCancelledError());

    await expect(useCase.execute({ confirm })).rejects.toThrow(PromptCancelledError);

    sinon.assert.notCalled(config.set);
  });
});
