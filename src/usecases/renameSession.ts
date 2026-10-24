import type { SessionManagerKind, SessionManagers } from '../lib/sessionManager.js';

export type RenameSessionParams = {
  sessionManager: SessionManagerKind;
  oldName: string;
  newName: string;
};

export type RenameSessionResult = {
  renamed: boolean;
};

/**
 * Use case for renaming a workspace's session, if one exists. Never throws: a
 * session manager failure shouldn't fail the surrounding rename.
 */
export class RenameSessionUseCase {
  constructor(private sessionManagers: SessionManagers) {}

  async execute(params: RenameSessionParams): Promise<RenameSessionResult> {
    const sessions = this.sessionManagers.get(params.sessionManager);
    if (!sessions) {
      return { renamed: false };
    }
    try {
      return { renamed: await sessions.rename(params.oldName, params.newName) };
    } catch {
      return { renamed: false };
    }
  }
}
