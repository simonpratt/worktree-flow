import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { CreateWorkspaceUseCase } from '../createWorkspace.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';

describe('CreateWorkspaceUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let useCase: CreateWorkspaceUseCase;

  beforeEach(() => {
    workspaceDir = {
      createWorkspaceDir: sinon.stub(),
      copyAgentsMd: sinon.stub(),
      copyRootMarkdownFiles: sinon.stub(),
      copyDevcontainer: sinon.stub(),
    } as any;
    workspaceConfig = {
      savePlaceholder: sinon.stub(),
    } as any;
    useCase = new CreateWorkspaceUseCase(workspaceDir, workspaceConfig);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create workspace directory and save placeholder config', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    const result = await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.createWorkspaceDir, '/dest', 'feature');
    sinon.assert.calledOnceWithExactly(workspaceConfig.savePlaceholder, '/dest/feature', 'feature');
    expect(result.workspacePath).toBe('/dest/feature');
  });

  it('should persist the unsanitized branch name, which the workspace session is also named after', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature_ABC-123');

    await useCase.execute({
      branchName: 'feature/ABC-123',
      sourcePath: '/source',
      destPath: '/dest',
    });

    sinon.assert.calledOnceWithExactly(workspaceConfig.savePlaceholder, '/dest/feature_ABC-123', 'feature/ABC-123');
  });

  it('should copy AGENTS.md from source path', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.copyAgentsMd, '/source', '/dest/feature', []);
  });

  it('should pass excluded folder names through to the AGENTS.md copy', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
      excludedFolderNames: ['api-1', 'client'],
    });

    sinon.assert.calledOnceWithExactly(
      workspaceDir.copyAgentsMd,
      '/source',
      '/dest/feature',
      ['api-1', 'client']
    );
  });

  it('should copy other root markdown files from source path', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
    });

    sinon.assert.calledOnceWithExactly(
      workspaceDir.copyRootMarkdownFiles,
      '/source',
      '/dest/feature'
    );
  });

  it('should copy .devcontainer from source path', async () => {
    workspaceDir.createWorkspaceDir.returns('/dest/feature');

    await useCase.execute({
      branchName: 'feature',
      sourcePath: '/source',
      destPath: '/dest',
    });

    sinon.assert.calledOnceWithExactly(workspaceDir.copyDevcontainer, '/source', '/dest/feature');
  });
});
