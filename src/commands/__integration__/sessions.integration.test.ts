import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { runSessions } from '../sessions.js';
import type { SessionManagerKind } from '../../lib/sessionManager.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('sessions integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let multiselectStub: sinon.SinonStub;
  let tmuxStub: sinon.SinonStubbedInstance<any>;
  let herdrStub: sinon.SinonStubbedInstance<any>;

  function setup(sessionManager: SessionManagerKind) {
    integration = createIntegrationServices(sourcePath, destPath);
    (integration.services.config.load as sinon.SinonStub).returns({
      sourcePath,
      destPath,
      copyFiles: '.env',
      sessionManager,
      postCheckout: undefined,
      perRepoPostCheckout: {},
      fetchCacheTtlSeconds: 300,
      repoGroups: {},
    });
    tmuxStub = integration.services.tmux as sinon.SinonStubbedInstance<any>;
    herdrStub = integration.services.herdr as sinon.SinonStubbedInstance<any>;
  }

  async function createWorkspace(branchName: string, repos: string[]) {
    return createTestWorkspace(integration.useCases, {
      repos,
      branchName,
      sourceBranch: 'master',
      sourcePath,
      destPath,
      copyFiles: '.env',
    });
  }

  const logs = () => (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0] as string);

  beforeEach(async () => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    multiselectStub = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('should explain how to configure a session manager when none is set', async () => {
    setup('none');

    await expect(
      runSessions(integration.useCases, integration.services, { multiselect: multiselectStub })
    ).rejects.toThrow('flow config set session-manager');
  });

  it('should log "No workspaces found." when dest is empty', async () => {
    setup('tmux');

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub });

    sinon.assert.calledWith(integration.stubs.console.log as any, 'No workspaces found.');
  });

  it('should offer only workspaces without a session, and open the ones picked with a pane per worktree', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    setup('tmux');

    const a = await createWorkspace('feature/a', [repo1, repo2]);
    const b = await createWorkspace('feature-b', [repo1]);
    await createWorkspace('has-session', [repo1]);
    tmuxStub.exists.callsFake(async (name: string) => name === 'has-session');
    multiselectStub.resolves([a.workspacePath]);

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub });

    const offered = multiselectStub.firstCall.args[0].options;
    expect(offered).toEqual(
      expect.arrayContaining([
        { value: a.workspacePath, label: 'feature/a' },
        { value: b.workspacePath, label: 'feature-b' },
      ])
    );
    expect(offered).toHaveLength(2);

    sinon.assert.calledOnceWithExactly(tmuxStub.create, 'feature/a', a.workspacePath, [
      { path: path.join(a.workspacePath, 'repo1') },
      { path: path.join(a.workspacePath, 'repo2') },
    ]);
    expect(logs().some((line) => line.includes('Created 1 tmux session'))).toBe(true);
  });

  it('should open every workspace without a session, without prompting, with --all', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');

    await createWorkspace('feature-a', [repo1]);
    await createWorkspace('feature-b', [repo1]);

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub }, { all: true });

    sinon.assert.notCalled(multiselectStub);
    sinon.assert.calledTwice(tmuxStub.create);
    expect(logs().some((line) => line.includes('Created 2 tmux sessions'))).toBe(true);
  });

  it('should open herdr sessions when herdr is the session manager', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('herdr');

    const a = await createWorkspace('feature-a', [repo1]);

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub }, { all: true });

    sinon.assert.calledOnceWithExactly(herdrStub.create, 'feature-a', a.workspacePath, [
      { path: path.join(a.workspacePath, 'repo1') },
    ]);
    sinon.assert.notCalled(tmuxStub.create);
    expect(logs().some((line) => line.includes('Created 1 herdr session'))).toBe(true);
  });

  it('should not prompt when every workspace already has a session', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');

    await createWorkspace('feature-a', [repo1]);
    tmuxStub.exists.resolves(true);

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub });

    sinon.assert.notCalled(multiselectStub);
    sinon.assert.notCalled(tmuxStub.create);
    expect(logs()).toContain('All 1 workspace(s) already have a tmux session.');
  });

  it('should do nothing when no workspaces are picked', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');

    await createWorkspace('feature-a', [repo1]);
    multiselectStub.resolves([]);

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub });

    sinon.assert.notCalled(tmuxStub.create);
    expect(logs()).toContain('No workspaces selected.');
  });

  it('should report errors opening a session', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    setup('tmux');

    await createWorkspace('feature-a', [repo1]);
    tmuxStub.create.rejects(new Error('no space for new pane'));

    await runSessions(integration.useCases, integration.services, { multiselect: multiselectStub }, { all: true });

    expect(logs().some((line) => line.includes('feature-a: no space for new pane'))).toBe(true);
  });
});
