import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { runQuickstart } from '../quickstart.js';
import {
  createIntegrationServices,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('quickstart integration', () => {
  let integration: IntegrationServices;
  let inputStub: sinon.SinonStub;
  let shellStub: { execFile: sinon.SinonStub };
  let discoverReposStub: sinon.SinonStub;

  beforeEach(() => {
    inputStub = sinon.stub();
    shellStub = { execFile: sinon.stub().resolves({ stdout: '/usr/bin/tmux', stderr: '' }) };
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
    inputStub.onCall(3).resolves('no');

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
    inputStub.onCall(3).resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['post-checkout']).toBe('npm ci');
  });

  it('should not set post-checkout when skipped', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['post-checkout']).toBeUndefined();
  });

  it('should save tmux as true when user answers yes', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('yes');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['tmux']).toBe('true');
  });

  it('should save tmux as false when user answers no', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['tmux']).toBe('false');
  });

  it('should pre-fill source-path prompt with existing value', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
    });

    inputStub.resolves('no');

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

    inputStub.resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const postCheckoutCall = inputStub.getCall(2).args[0];
    expect(postCheckoutCall.default).toBe('npm ci');
  });

  it('should pre-fill tmux prompt with yes when tmux is currently enabled', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'tmux': 'true',
    });

    inputStub.resolves('yes');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const tmuxCall = inputStub.getCall(3).args[0];
    expect(tmuxCall.default).toBe('yes');
  });

  it('should pre-fill tmux prompt with no when tmux is currently disabled', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'tmux': 'false',
    });

    inputStub.resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const tmuxCall = inputStub.getCall(3).args[0];
    expect(tmuxCall.default).toBe('no');
  });

  it('should not save config if a prompt throws', async () => {
    inputStub.onCall(0).rejects(new Error('ExitPromptError'));

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub }).catch(() => {});

    sinon.assert.notCalled(integration.services.config.saveRaw as sinon.SinonStub);
  });

  it('should preserve existing config keys not touched by quickstart', async () => {
    integration.services.config.loadRaw = sinon.stub().returns({
      'source-path': '/existing/repos',
      'dest-path': '/existing/workspaces',
      'copy-files': '.env,.secrets',
      'branch-auto-select-repos': 'repo1,repo2',
    });

    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
    expect(saved['copy-files']).toBe('.env,.secrets');
    expect(saved['branch-auto-select-repos']).toBe('repo1,repo2');
  });

  describe('when tmux is not installed', () => {
    beforeEach(() => {
      shellStub.execFile.rejects(new Error('which: no tmux in PATH'));
    });

    it('should skip the tmux prompt', async () => {
      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/workspaces');
      inputStub.onCall(2).resolves('');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      expect(inputStub.callCount).toBe(3);
    });

    it('should save tmux as false when not installed and no existing setting', async () => {
      inputStub.onCall(0).resolves('/my/repos');
      inputStub.onCall(1).resolves('/my/workspaces');
      inputStub.onCall(2).resolves('');

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['tmux']).toBe('false');
    });

    it('should preserve existing tmux setting when tmux is not installed', async () => {
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
      expect(saved['tmux']).toBe('true');
    });
  });

  it('should default dest-path to ~/dev/workspaces when no existing config', async () => {
    inputStub.onCall(0).resolves('/my/repos');
    inputStub.onCall(1).resolves('/my/workspaces');
    inputStub.onCall(2).resolves('');
    inputStub.onCall(3).resolves('no');

    await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

    const destPromptCall = inputStub.getCall(1).args[0];
    expect(destPromptCall.default).toBe('~/dev/workspaces');
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
      inputStub.onCall(4).resolves('no');              // tmux

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
      inputStub.onCall(4).resolves('no');              // tmux

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub });

      const saved = (integration.services.config.saveRaw as sinon.SinonStub).firstCall.args[0];
      expect(saved['source-path']).toBe('/my/repos');
    });

    it('should not save config if user exits during source-path retry', async () => {
      discoverReposStub.onFirstCall().returns([]);
      inputStub.onCall(0).resolves('/wrong/path');
      inputStub.onCall(1).rejects(Object.assign(new Error('ExitPromptError'), { name: 'ExitPromptError' }));

      await runQuickstart(integration.services, { input: inputStub, shell: shellStub }).catch(() => {});

      sinon.assert.notCalled(integration.services.config.saveRaw as sinon.SinonStub);
    });
  });
});
