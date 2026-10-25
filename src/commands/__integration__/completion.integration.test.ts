import { describe, it, expect, afterEach } from 'vitest';
import sinon from 'sinon';
import { runCompletion } from '../completion.js';
import { createIntegrationServices } from '../../test/integration-test-utils.js';

describe('completion integration', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('prints the zsh completion file', () => {
    const { services, stubs } = createIntegrationServices('/source', '/dest');

    runCompletion('zsh', services);

    const script = (stubs.console.write as sinon.SinonStub).firstCall.args[0] as string;
    expect(script.startsWith('#compdef flow\n')).toBe(true);
    expect(script).toContain('flow __complete --');
  });

  it('rejects an unsupported shell, listing the supported ones', () => {
    const { services, stubs } = createIntegrationServices('/source', '/dest');

    expect(() => runCompletion('bash', services)).toThrow('Unsupported shell: bash. Supported: zsh');
    sinon.assert.notCalled(stubs.console.write as sinon.SinonStub);
  });
});
