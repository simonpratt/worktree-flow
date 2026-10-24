import type { ConfigService } from '../lib/config.js';
import type { HerdrService } from '../lib/herdr.js';
import type { SessionManagerKind } from '../lib/sessionManager.js';

export type OfferHerdrIntegrationParams = {
  confirm: (opts: { message: string; default: boolean }) => Promise<boolean>;
};

export type OfferHerdrIntegrationResult = {
  /** The session manager to use for this operation */
  sessionManager: SessionManagerKind;
  /** True when the user just enabled the herdr integration */
  enabled: boolean;
};

/**
 * Use case for offering the herdr integration to users who have herdr installed
 * but no session manager configured. Asks once: a yes saves herdr as the session
 * manager, a no is remembered so they aren't asked again. A cancelled prompt
 * saves nothing, so they're asked again next time.
 */
export class OfferHerdrIntegrationUseCase {
  constructor(
    private config: ConfigService,
    private herdr: Pick<HerdrService, 'isInstalled'>
  ) {}

  async execute(params: OfferHerdrIntegrationParams): Promise<OfferHerdrIntegrationResult> {
    const { sessionManager, herdrPrompted } = this.config.load();

    if (sessionManager !== 'none' || herdrPrompted || !(await this.herdr.isInstalled())) {
      return { sessionManager, enabled: false };
    }

    const enable = await params.confirm({
      message: 'herdr is installed. Open a herdr session per workspace, with a pane per worktree?',
      default: true,
    });

    if (!enable) {
      this.config.set({ 'herdr-prompted': 'true' });
      return { sessionManager, enabled: false };
    }

    this.config.set({ 'session-manager': 'herdr', 'herdr-prompted': 'true' });
    return { sessionManager: 'herdr', enabled: true };
  }
}
