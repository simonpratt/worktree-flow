import path from 'node:path';
import type { IFileSystem, IShell } from '../adapters/types.js';
import { UnsafeTrashPathError } from './errors.js';

export const TRASH_DIR_NAME = '.flow-trash';

/**
 * TrashService removes large directories (e.g. ones full of node_modules) without
 * making the caller wait: a same-filesystem rename hides them instantly, and the
 * slow recursive delete runs in a detached process. Anything still in the trash
 * folder afterwards is a delete that failed.
 */
export class TrashService {
  constructor(
    private fs: IFileSystem,
    private shell: IShell
  ) {}

  /**
   * Moves a directory into a `.flow-trash` folder beside it, so the rename stays on
   * the same filesystem and is instant regardless of size.
   * @example moveToTrash('/workspaces/feature') → '/workspaces/.flow-trash/feature-1729771200000'
   */
  moveToTrash(dirPath: string): string {
    const trashDir = path.join(path.dirname(dirPath), TRASH_DIR_NAME);
    this.fs.mkdirSync(trashDir, { recursive: true });

    const name = path.basename(dirPath);
    let trashedPath = path.join(trashDir, `${name}-${Date.now()}`);
    for (let suffix = 1; this.fs.existsSync(trashedPath); suffix++) {
      trashedPath = path.join(trashDir, `${name}-${Date.now()}-${suffix}`);
    }

    this.fs.renameSync(dirPath, trashedPath);
    return trashedPath;
  }

  /**
   * Starts a detached `rm -rf` of a path returned by moveToTrash.
   * @throws UnsafeTrashPathError if the path isn't an absolute `.flow-trash/<name>-<timestamp>[-<n>]` entry
   */
  deleteInBackground(trashedPath: string): void {
    if (!isTrashedPath(trashedPath)) {
      throw new UnsafeTrashPathError(trashedPath);
    }
    this.shell.spawnDetached('rm', ['-rf', trashedPath]);
  }
}

// Matches the `<name>-<Date.now()>[-<suffix>]` names moveToTrash produces
const TRASHED_NAME_PATTERN = /^.+-\d{13}(-\d+)?$/;

/**
 * Guards the recursive delete: the path must be absolute and already normalised
 * (no `..` escaping the trash), and sit directly inside a `.flow-trash` folder
 * with a name moveToTrash could have produced.
 */
function isTrashedPath(trashedPath: string): boolean {
  return (
    path.isAbsolute(trashedPath) &&
    path.normalize(trashedPath) === trashedPath &&
    path.basename(path.dirname(trashedPath)) === TRASH_DIR_NAME &&
    TRASHED_NAME_PATTERN.test(path.basename(trashedPath))
  );
}
