import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { CreateWorkspaceUseCase } from '../createWorkspace.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import type { TmuxService } from '../../lib/tmux.js';

describe('CreateWorkspaceUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let tmux: sinon.SinonStubbedInstance<TmuxService>;
  let useCase: CreateWorkspaceUseCase;

  beforeEach(() => {
    workspaceDir = {
      createWorkspaceDir: sinon.stub(),
      copyAgentsMd: sinon.stub(),
      copyDevcontainer: sinon.stub(),
    } as any;
    workspaceConfig = {
      savePlaceholder: sinon.stub(),
    } as any;
    tmux = {
      createSession: sinon.stub(),
    } as any;

    useCase = new CreateWorkspaceUseCase(workspaceDir, workspaceConfig, tmux);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create workspace directory and save placeholder config', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');
    tmux.createSession.resolves();

    const result = await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: false,
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.createWorkspaceDir, '/dest', 'feature');
    sinon.assert.calledOnceWithExactly(workspaceConfig.savePlaceholder, '/dest/feature');
    expect(result.workspacePath).toBe('/dest/feature');
  });

  it('should copy AGENTS.md from source path', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: false,
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.copyAgentsMd, '/source', '/dest/feature');
  });

  it('should copy .devcontainer from source path', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: false,
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.copyDevcontainer, '/source', '/dest/feature');
  });

  it('should create tmux session with empty worktree array when tmux is enabled', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');
    tmux.createSession.resolves();

    const result = await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: true,
    });

    sinon.assert.calledOnceWithExactly(tmux.createSession, '/dest/feature', 'feature', []);
    expect(result.tmuxCreated).toBe(true);
  });

  it('should handle tmux creation failure gracefully and return tmuxCreated: false', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');
    tmux.createSession.rejects(new Error('tmux not available'));

    const result = await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: true,
    });

    expect(result.tmuxCreated).toBe(false);
    expect(result.workspacePath).toBe('/dest/feature');
  });

  it('should not create tmux session when tmux is disabled', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    const result = await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      tmux: false,
    });

    sinon.assert.notCalled(tmux.createSession);
    expect(result.tmuxCreated).toBe(false);
  });
});
