import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { ListWorkspaceSessionsUseCase } from '../listWorkspaceSessions.js';
import type { SessionManager } from '../../lib/sessionManager.js';
import type { WorkspaceDirectoryService } from '../../lib/workspaceDirectory.js';
import type { WorkspaceConfigService } from '../../lib/workspaceConfig.js';
import { createMockSessionManager } from '../../test/test-utils.js';

describe('ListWorkspaceSessionsUseCase', () => {
  let workspaceDir: sinon.SinonStubbedInstance<WorkspaceDirectoryService>;
  let workspaceConfig: sinon.SinonStubbedInstance<WorkspaceConfigService>;
  let sessions: sinon.SinonStubbedInstance<SessionManager>;
  let useCase: ListWorkspaceSessionsUseCase;

  beforeEach(() => {
    workspaceDir = { listWorkspaces: sinon.stub().returns([]) } as any;
    workspaceConfig = { getBranchName: sinon.stub().returns(undefined) } as any;
    sessions = createMockSessionManager();
    useCase = new ListWorkspaceSessionsUseCase(workspaceDir, workspaceConfig);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns an empty list when there are no workspaces', async () => {
    expect(await useCase.execute({ sessions, destPath: '/dest' })).toEqual([]);
  });

  it('reports which workspaces have a session, named after their persisted branch name', async () => {
    workspaceDir.listWorkspaces.returns([
      { name: 'feature_ABC-1', path: '/dest/feature_ABC-1' },
      { name: 'legacy', path: '/dest/legacy' },
    ] as any);
    workspaceConfig.getBranchName.withArgs('/dest/feature_ABC-1').returns('feature/ABC-1');
    sessions.exists.withArgs('feature/ABC-1').resolves(true);

    const result = await useCase.execute({ sessions, destPath: '/dest' });

    expect(result).toEqual([
      { path: '/dest/feature_ABC-1', sessionName: 'feature/ABC-1', hasSession: true },
      // Workspaces that predate the persisted branch name fall back to the folder name
      { path: '/dest/legacy', sessionName: 'legacy', hasSession: false },
    ]);
  });
});
