import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { runQuickstart } from '../quickstart.js';
import { PromptCancelledError } from '../../lib/errors.js';
import {
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('quickstart integration', () => {
  let integration: IntegrationServices;
  let inputStub: sinon.SinonStub;
  let shellStub: { execFile: sinon.SinonStub; spawnDetached: sinon.SinonStub };
  let discoverReposStub: sinon.SinonStub;

  // Answers every prompt with `answer`, except the dest-path prompt, which must differ from the source-path
  const answerAllPromptsWith = (answer: string) =>
    inputStub.callsFake(async ({ message }: { message: string }) =>
      message.startsWith('Where should workspaces') ? '/my/workspaces' : answer
    );

  beforeEach(() => {
    inputStub = sinon.stub();
    // Default: both tmux and herdr are installed
    shellStub = { execFile: sinon.stub().resolves({ stdout: '/usr/bin/x', stderr: '' }), spawnDetached: sinon.stub() };
    integration = createIntegrationServices('/source', '/dest');
    integration.services.config.loadRaw = sinon.stub().returns({});
    integration.services.config.saveRaw = sinon.stub();
    // Default: source path always yields two repos so prompts resolve without looping
    discoverReposStub = sinon.stub(integration.services.repos, 'discoverRepos')
      .returns(['/my/repos/repo-a', '/my/repos/repo-b']);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should save source-path and dest-path from user input', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saveCall = (integration.services.config.saveRaw as sinon.SinonStub).firstCall;
    expect(saveCall).toBeDefined();
    expect(saveCall.args[0]['source-path']).toBe('/my/repos');
    expect(saveCall.args[0]['dest-path']).toBe('/my/workspaces');
  });

  it('should save post-checkout when provided', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('npm ci');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['post-checkout']).toBe('npm ci');
  });

  it('should not set post-checkout when skipped', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['post-checkout']).toBeUndefined();
  });

  it('should save the chosen session manager', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('herdr');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['session-manager']).toBe('herdr');
  });

  it('should save no session manager when user chooses none', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['session-manager']).toBe('none');
  });

  it('should only offer session managers that are installed', async () => {
    shellStub.execFile.withArgs('which', ['tmux']).rejects(new Error('which: no tmux in PATH'));

    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('tmux');  // not installed, so re-prompted
    inputStub.onCall(4).resolves('herdr');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    expect(inputStub.getCall(3).args[0].message).toBe('Session manager (none/herdr)?');
    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['session-manager']).toBe('herdr');
  });

  it('should re-prompt until a valid session manager is given', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('yes');
    inputStub.onCall(4).resolves(' TMUX ');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const logs = (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0]);
    expect(logs.some((line: string) => line.includes('Choose one of: none, tmux, herdr'))).toBe(true);
    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['session-manager']).toBe('tmux');
  });

  it('should pre-fill source-path prompt with existing value', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
    });

    answerAllPromptsWith('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const firstInputCall = inputStub.firstCall.args[0];
    expect(firstInputCall.default).toBe('/existing/repos');
  });

  it('should pre-fill post-checkout prompt with existing value', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'post-checkout': 'npm ci',
    });

    answerAllPromptsWith('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const postCheckoutCall = inputStub.getCall(2).args[0];
    expect(postCheckoutCall.default).toBe('npm ci');
  });

  it('should pre-fill the session manager prompt with the current setting', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'session-manager': 'herdr',
    });

    answerAllPromptsWith('herdr');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    expect(inputStub.getCall(3).args[0].default).toBe('herdr');
  });

  it('should pre-fill tmux from the legacy tmux setting, and replace that setting on save', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'tmux': 'true',
    });

    answerAllPromptsWith('tmux');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    expect(inputStub.getCall(3).args[0].default).toBe('tmux');
    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['session-manager']).toBe('tmux');
    expect(saved).not.toHaveProperty('tmux');
  });

  it('should pre-fill none when nothing is configured', async () => {
    answerAllPromptsWith('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    expect(inputStub.getCall(3).args[0].default).toBe('none');
  });

  it('should not save config if a prompt throws', async () => {
    inputStub.onCall(0).rejects(new PromptCancelledError());

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub }).catch(() => {});

    sinon.assert.notCalled(integration.services.config.saveRaw as sinon.SinonStub);
  });

  it('should preserve existing config keys not touched by quickstart', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'copy-files': '.env,.secrets',
      'repo-groups': { backend: ['repo1', 'repo2'] },
    });

    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['copy-files']).toBe('.env,.secrets');
    expect(saved['repo-groups']).toEqual({ backend: ['repo1', 'repo2'] });
  });

  describe('when no session manager is installed', () => {
    beforeEach(() => {
      shellStub.execFile.rejects(new Error('which: not found'));
    });

    it('should skip the session manager prompt', async () => {
      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/workspaces');
      inputStub.onCall(2).resolves('');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      expect(inputStub.callCount).toBe(3);
    });

    it('should save no session manager when there is no existing setting', async () => {
      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/workspaces');
      inputStub.onCall(2).resolves('');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['session-manager']).toBe('none');
    });

    it('should preserve the existing session manager', async () => {
      integration.services.config.loadRaw = sinon.stub().returns({
        'source-path': '/existing/repos',
        'dest-path': '/existing/workspaces',
        'tmux': 'true',
      });

      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/workspaces');
      inputStub.onCall(2).resolves('');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['session-manager']).toBe('tmux');
    });
  });

  it('should default dest-path to a .workspaces folder inside the chosen source-path', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/repos/.workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const destPromptCall = inputStub.getCall(1).args[0];
    expect(destPromptCall.default).toBe('/my/repos/.workspaces');
  });

  it('should keep an existing dest-path as the default instead of the nested one', async () => {
    (integration.services.config.loadRaw as sinon.SinonStub).returns({
      'source-path': '/my/repos',
      'dest-path': '/existing/workspaces',
    });
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/existing/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('none');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    expect(inputStub.getCall(1).args[0].default).toBe('/existing/workspaces');
  });

  describe('dest-path validation loop', () => {
    it('should re-prompt when dest-path is the source-path', async () => {
      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/repos');             // dest-path attempt 1 (rejected)
      inputStub.onCall(2).resolves('/my/repos/.workspaces'); // dest-path attempt 2
      inputStub.onCall(3).resolves('');
      inputStub.onCall(4).resolves('none');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['dest-path']).toBe('/my/repos/.workspaces');
    });

    it('should re-prompt when the source-path is inside the dest-path', async () => {
      inputStub.onCall(0).resolves('/my/workspaces/repos');
      inputStub.onCall(1).resolves('/my/workspaces');        // rejected
      inputStub.onCall(2).resolves('/my/other');
      inputStub.onCall(3).resolves('');
      inputStub.onCall(4).resolves('none');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['dest-path']).toBe('/my/other');
    });
  });

  describe('source-path validation loop', () => {
    it('should re-prompt when directory does not exist', async () => {
      const enoentError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      discoverReposStub.onFirstCall().throws(enoentError);
      discoverReposStub.onSecondCall().returns(['/my/repos/repo-a']);

      inputStub.onCall(0).resolves('/nonexistent');    // source-path attempt 1 (fails)
      inputStub.onCall(1).resolves('/my/repos');       // source-path attempt 2 (succeeds)
      inputStub.onCall(2).resolves('/my/workspaces');  // dest-path
      inputStub.onCall(3).resolves('');                // post-checkout
      inputStub.onCall(4).resolves('none');            // session manager

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['source-path']).toBe('/my/repos');
    });

    it('should re-prompt when directory contains no git repositories', async () => {
      discoverReposStub.onFirstCall().returns([]);
      discoverReposStub.onSecondCall().returns(['/my/repos/repo-a']);

      inputStub.onCall(0).resolves('/wrong/path');     // source-path attempt 1 (empty)
      inputStub.onCall(1).resolves('/my/repos');       // source-path attempt 2 (succeeds)
      inputStub.onCall(2).resolves('/my/workspaces');  // dest-path
      inputStub.onCall(3).resolves('');                // post-checkout
      inputStub.onCall(4).resolves('none');            // session manager

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['source-path']).toBe('/my/repos');
    });

    it('should not save config if user exits during source-path retry', async () => {
      discoverReposStub.onFirstCall().returns([]);
      inputStub.onCall(0).resolves('/wrong/path');
      inputStub.onCall(1).rejects(new PromptCancelledError());

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub }).catch(() => {});

      sinon.assert.notCalled(integration.services.config.saveRaw as sinon.SinonStub);
    });
  });
});
