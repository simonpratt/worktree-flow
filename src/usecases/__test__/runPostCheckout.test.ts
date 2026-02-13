import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { RunPostCheckoutUseCase } from '../runPostCheckout.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { PostCheckoutService } from '../../lib/postCheckout.js';
import type { TmuxService } from '../../lib/tmux.js';

describe('RunPostCheckoutUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let postCheckout: sinon.SinonStubbedInstance<PostCheckoutService>;
  let tmux: sinon.SinonStubbedInstance<TmuxService>;
  let useCase: RunPostCheckoutUseCase;

  beforeEach(() => {
    workspaceDir = {
      getWorktreeDirs: sinon.stub(),
    } as any;
    postCheckout = {
      runCommandInDirectory: sinon.stub(),
    } as any;
    tmux = {
      sendKeysToPane: sinon.stub(),
    } as any;

    useCase = new RunPostCheckoutUseCase(workspaceDir, postCheckout, tmux);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('execute', () => {
    it('should run global command in all worktrees when tmux is disabled', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      postCheckout.runCommandInDirectory.resolves();

      const result = await useCase.execute({
        workspacePath: '/workspace/feature',
        tmuxEnabled: false,
        postCheckout: 'npm install',
        perRepoPostCheckout: {},
      });

      sinon.assert.calledOnceWithExactly(
        workspaceDir.getWorktreeDirs,
        '/workspace/feature'
      );
      sinon.assert.calledTwice(postCheckout.runCommandInDirectory);
      sinon.assert.calledWith(
        postCheckout.runCommandInDirectory,
        '/workspace/feature/repo1',
        'npm install'
      );
      sinon.assert.calledWith(
        postCheckout.runCommandInDirectory,
        '/workspace/feature/repo2',
        'npm install'
      );
      sinon.assert.notCalled(tmux.sendKeysToPane);

      expect(result).toEqual({
        successCount: 2,
        totalCount: 2,
      });
    });

    it('should use per-repo command when configured', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      const perRepoCommands = { repo1: 'yarn install', repo2: 'npm run build' };
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      postCheckout.runCommandInDirectory.resolves();

      await useCase.execute({
        workspacePath: '/workspace/feature',
        tmuxEnabled: false,
        postCheckout: 'npm install',
        perRepoPostCheckout: perRepoCommands,
      });

      sinon.assert.calledWith(
        postCheckout.runCommandInDirectory,
        '/workspace/feature/repo1',
        'yarn install'
      );
      sinon.assert.calledWith(
        postCheckout.runCommandInDirectory,
        '/workspace/feature/repo2',
        'npm run build'
      );
    });

    it('should run commands in tmux panes when tmux is enabled', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      tmux.sendKeysToPane.resolves();

      const result = await useCase.execute({
        workspacePath: '/workspace/feature',
        sessionName: 'feature',
        tmuxEnabled: true,
        postCheckout: 'npm install',
        perRepoPostCheckout: {},
      });

      sinon.assert.calledTwice(tmux.sendKeysToPane);
      sinon.assert.calledWith(tmux.sendKeysToPane, 'feature', 1, 'npm install');
      sinon.assert.calledWith(tmux.sendKeysToPane, 'feature', 2, 'npm install');
      sinon.assert.notCalled(postCheckout.runCommandInDirectory);

      expect(result).toEqual({
        successCount: 2,
        totalCount: 2,
      });
    });

    it('should handle per-repo commands with tmux', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      const perRepoCommands = { repo1: 'yarn install', repo2: 'npm run build' };
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      tmux.sendKeysToPane.resolves();

      await useCase.execute({
        workspacePath: '/workspace/feature',
        sessionName: 'feature',
        tmuxEnabled: true,
        postCheckout: 'npm install',
        perRepoPostCheckout: perRepoCommands,
      });

      sinon.assert.calledWith(tmux.sendKeysToPane, 'feature', 1, 'yarn install');
      sinon.assert.calledWith(tmux.sendKeysToPane, 'feature', 2, 'npm run build');
    });

    it('should skip when no commands configured', async () => {
      const result = await useCase.execute({
        workspacePath: '/workspace/feature',
        tmuxEnabled: false,
        postCheckout: undefined,
        perRepoPostCheckout: {},
      });

      sinon.assert.notCalled(workspaceDir.getWorktreeDirs);
      sinon.assert.notCalled(postCheckout.runCommandInDirectory);
      sinon.assert.notCalled(tmux.sendKeysToPane);

      expect(result).toBeUndefined();
    });

    it('should skip repos with no command', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      const perRepoCommands = { repo1: 'yarn install' };
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      postCheckout.runCommandInDirectory.resolves();

      const result = await useCase.execute({
        workspacePath: '/workspace/feature',
        tmuxEnabled: false,
        postCheckout: undefined,
        perRepoPostCheckout: perRepoCommands,
      });

      sinon.assert.calledOnce(postCheckout.runCommandInDirectory);
      sinon.assert.calledWith(
        postCheckout.runCommandInDirectory,
        '/workspace/feature/repo1',
        'yarn install'
      );
      expect(result).toEqual({
        successCount: 1,
        totalCount: 1,
      });
    });

    it('should handle command failures', async () => {
      const worktreeDirs = ['/workspace/feature/repo1', '/workspace/feature/repo2'];
      workspaceDir.getWorktreeDirs.returns(worktreeDirs);
      postCheckout.runCommandInDirectory
        .onFirstCall().resolves()
        .onSecondCall().rejects(new Error('command failed'));

      const result = await useCase.execute({
        workspacePath: '/workspace/feature',
        tmuxEnabled: false,
        postCheckout: 'npm install',
        perRepoPostCheckout: {},
      });

      expect(result).toEqual({
        successCount: 1,
        totalCount: 2,
      });
    });
  });
});
