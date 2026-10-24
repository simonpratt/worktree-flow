import type { TmuxService } from '../lib/tmux.js';

export type RenameTmuxSessionParams = {
  oldName: string;
  newName: string;
};

export type RenameTmuxSessionResult = {
  renamed: boolean;
};

/**
 * Use case for renaming a workspace's tmux session, if one exists. Never
 * throws: a tmux failure shouldn't fail the surrounding rename.
 */
export class RenameTmuxSessionUseCase {
  constructor(private tmux: TmuxService) {}

  async execute(params: RenameTmuxSessionParams): Promise<RenameTmuxSessionResult> {
    try {
      const exists = await this.tmux.sessionExists(params.oldName);
      if (!exists) {
        return { renamed: false };
      }
      await this.tmux.renameSession(params.oldName, params.newName);
      return { renamed: true };
    } catch {
      return { renamed: false };
    }
  }
}
