import { describe, it, expect } from 'vitest';
import path from 'node:path';
import sinon from 'sinon';
import { TrashService } from '../trash.js';
import { UnsafeTrashPathError } from '../errors.js';
import { createMemFs, createMockShell } from '../../test/test-utils.js';

describe('TrashService', () => {
  describe('moveToTrash', () => {
    it('should move the directory and all its contents into a .flow-trash folder beside it', () => {
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({
        [path.join(workspacePath, 'repo1', 'node_modules', 'dep', 'index.js')]: 'module',
        [path.join(workspacePath, 'flow-config.json')]: '{}',
      });
      const service = new TrashService(fs, createMockShell());

      const trashedPath = service.moveToTrash(workspacePath);

      expect(path.dirname(trashedPath)).toBe('/workspaces/.flow-trash');
      expect(path.basename(trashedPath)).toMatch(/^feature-123-\d+$/);
      expect(vol.existsSync(workspacePath)).toBe(false);
      expect(
        vol.readFileSync(path.join(trashedPath, 'repo1', 'node_modules', 'dep', 'index.js'), 'utf-8')
      ).toBe('module');
    });

    it('should not collide with an earlier trashed workspace of the same name', () => {
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({ [path.join(workspacePath, 'a.txt')]: 'first' });
      const service = new TrashService(fs, createMockShell());

      const first = service.moveToTrash(workspacePath);
      vol.mkdirSync(workspacePath, { recursive: true });
      vol.writeFileSync(path.join(workspacePath, 'a.txt'), 'second');
      const second = service.moveToTrash(workspacePath);

      expect(second).not.toBe(first);
      expect(vol.readFileSync(path.join(first, 'a.txt'), 'utf-8')).toBe('first');
      expect(vol.readFileSync(path.join(second, 'a.txt'), 'utf-8')).toBe('second');
    });

    it('should throw and leave the directory in place when the move fails', () => {
      const { fs } = createMemFs();
      const service = new TrashService(fs, createMockShell());

      expect(() => service.moveToTrash('/workspaces/missing')).toThrow();
    });
  });

  describe('deleteInBackground', () => {
    it('should start a detached recursive delete of the trashed path', () => {
      const { fs } = createMemFs();
      const shell = createMockShell();
      const service = new TrashService(fs, shell);

      service.deleteInBackground('/workspaces/.flow-trash/feature-123-1729771200000');

      sinon.assert.calledOnceWithExactly(
        shell.spawnDetached,
        'rm',
        ['-rf', '/workspaces/.flow-trash/feature-123-1729771200000']
      );
    });

    it('should delete a path returned by moveToTrash, including a collision suffix', () => {
      const workspacePath = '/workspaces/feature-123';
      const { vol, fs } = createMemFs({ [path.join(workspacePath, 'a.txt')]: 'first' });
      const shell = createMockShell();
      const service = new TrashService(fs, shell);

      const first = service.moveToTrash(workspacePath);
      vol.mkdirSync(workspacePath, { recursive: true });
      const second = service.moveToTrash(workspacePath);

      service.deleteInBackground(first);
      service.deleteInBackground(second);

      sinon.assert.calledWithExactly(shell.spawnDetached, 'rm', ['-rf', first]);
      sinon.assert.calledWithExactly(shell.spawnDetached, 'rm', ['-rf', second]);
    });

    it.each([
      ['a workspace outside the trash', '/workspaces/feature-123-1729771200000'],
      ['the trash folder itself', '/workspaces/.flow-trash'],
      ['a name without a timestamp', '/workspaces/.flow-trash/feature-123'],
      ['a name with a short number', '/workspaces/.flow-trash/feature-123-1'],
      ['a nested path inside a trashed workspace', '/workspaces/.flow-trash/feature-123-1729771200000/repo1'],
      ['a path that escapes the trash', '/workspaces/.flow-trash/../feature-123-1729771200000'],
      ['a relative path', '.flow-trash/feature-123-1729771200000'],
      ['the root directory', '/'],
    ])('should refuse to delete %s', (_, unsafePath) => {
      const { fs } = createMemFs();
      const shell = createMockShell();
      const service = new TrashService(fs, shell);

      expect(() => service.deleteInBackground(unsafePath)).toThrow(UnsafeTrashPathError);
      sinon.assert.notCalled(shell.spawnDetached);
    });
  });
});
