import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runTmuxResume } from '../tmux.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('tmux resume integration', () => {
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

  it('should log "No workspaces found." when dest is empty', async () => {
    integration = createIntegrationServices(sourcePath, destPath);
    await runTmuxResume(integration.useCases, integration.services);

    sinon.assert.calledWith(integration.stubs.console.log as any, 'No workspaces found.');
  });

  it('should create tmux sessions for all workspaces', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');

    integration = createIntegrationServices(sourcePath, destPath);

    // Create two workspaces
    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1, repo2],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false, // Don't create tmux during creation
    });

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-b',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    // Mock tmux to succeed
    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    tmuxStub.createSession.resolves();

    await runTmuxResume(integration.useCases, integration.services);

    // Verify tmux sessions were created for both workspaces
    sinon.assert.calledTwice(tmuxStub.createSession);

    // Verify console output
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const createdLine = logCalls.find((line: string) => line.includes('Created') && line.includes('session'));
    expect(createdLine).toBeDefined();
    expect(createdLine).toContain('2');
  });

  it('should skip workspaces with existing tmux sessions', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;

    // First call succeeds, second fails with duplicate session
    tmuxStub.createSession
      .onFirstCall()
      .resolves();
    tmuxStub.createSession
      .onSecondCall()
      .rejects(new Error('duplicate session: feature-a'));

    // Run twice
    await runTmuxResume(integration.useCases, integration.services);
    await runTmuxResume(integration.useCases, integration.services);

    // Verify console output on second run
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const skippedLine = logCalls.find((line: string) => line.includes('Skipped') && line.includes('existing'));
    expect(skippedLine).toBeDefined();
  });

  it('should handle errors during tmux session creation', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    tmuxStub.createSession.rejects(new Error('tmux not installed'));

    await runTmuxResume(integration.useCases, integration.services);

    // Verify error output
    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const errorSection = logCalls.find((line: string) => line.includes('Errors'));
    expect(errorSection).toBeDefined();
  });

  it('should show summary with workspace count', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-a',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    tmuxStub.createSession.resolves();

    await runTmuxResume(integration.useCases, integration.services);

    const logCalls = (integration.stubs.console.log as sinon.SinonStub).args.map(
      (a: any[]) => a[0]
    );
    const summaryLine = logCalls.find((line: string) => line.includes('Total:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('1 workspace');
  });

  it('should handle multiple workspaces with different session names', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');

    integration = createIntegrationServices(sourcePath, destPath);

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-branch-1',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    await integration.useCases.createBranchWorkspace.execute({
      repos: [repo1],
      branchName: 'feature-branch-2',
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
      tmux: false,
    });

    const tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    tmuxStub.createSession.resolves();

    await runTmuxResume(integration.useCases, integration.services);

    // Verify session names match workspace names
    const createSessionCalls = tmuxStub.createSession.getCalls();
    expect(createSessionCalls.length).toBe(2);

    const sessionNames = createSessionCalls.map((call: any) => call.args[1]);
    expect(sessionNames).toContain('feature-branch-1');
    expect(sessionNames).toContain('feature-branch-2');
  });
});
