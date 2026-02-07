import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runPull } from '../pull.js';
import { NotInWorkspaceError, WorkspaceNotFoundError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('pull integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should throw NotInWorkspaceError when cwd is outside dest', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/nowhere');

    await expect(runPull(undefined, integration.services)).rejects.toThrow(NotInWorkspaceError);
  });

  it('should throw WorkspaceNotFoundError when explicit branch does not exist', async () => {
    integration = createIntegrationServices(sourcePath, destPath);

    await expect(runPull('nonexistent', integration.services)).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('should detect workspace and attempt pull on repos', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Set cwd to inside the workspace
    (integration.stubs.process.cwd as sinon.SinonStub).returns(result.workspacePath);

    // Pull will fail (no real remote) but the orchestration should complete
    await runPull(undefined, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const resultLine = logCalls.find((line: string) =>
      line.includes('repos pulled successfully')
    );
    expect(resultLine).toBeDefined();
  });

  it('should detect workspace when cwd is inside a repo subdirectory', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    const result = await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Set cwd to inside a repo within the workspace
    const repoCwd = path.join(result.workspacePath, 'repo1');
    (integration.stubs.process.cwd as sinon.SinonStub).returns(repoCwd);

    await runPull(undefined, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const resultLine = logCalls.find((line: string) =>
      line.includes('repos pulled successfully')
    );
    expect(resultLine).toBeDefined();
  });

  it('should use explicit branch when provided', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.services.workspace.createBranchWorktrees(
      [repo1],
      destPath,
      'feature',
      'master',
      '.env'
    );

    // Set cwd to somewhere else - should not matter when explicit branch is provided
    (integration.stubs.process.cwd as sinon.SinonStub).returns('/tmp/somewhere');

    await runPull('feature', integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const resultLine = logCalls.find((line: string) =>
      line.includes('repos pulled successfully')
    );
    expect(resultLine).toBeDefined();
  });
});
