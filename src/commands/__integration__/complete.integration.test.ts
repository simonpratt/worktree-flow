import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import { Command } from 'commander';
import { runComplete, registerCompleteCommand } from '../complete.js';
import { registerSwitchCommand } from '../switch.js';
import { registerSessionsCommand } from '../sessions.js';
import { registerBranchCommand } from '../branch.js';
import { ConfigNotSetError } from '../../lib/errors.js';
import {
  createTempDir,
  initGitRepo,
  createIntegrationServices,
  createTestWorkspace,
  type IntegrationServices,
} from '../../test/integration-test-utils.js';

describe('__complete integration', () => {
  let tempDir: { path: string; cleanup: () => void };
  let sourcePath: string;
  let destPath: string;
  let integration: IntegrationServices;
  let program: Command;

  const output = () => (integration.stubs.console.log as sinon.SinonStub).args.map((a: any[]) => a[0] as string);

  beforeEach(() => {
    tempDir = createTempDir();
    sourcePath = path.join(tempDir.path, 'source');
    destPath = path.join(tempDir.path, 'dest');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(destPath, { recursive: true });
    integration = createIntegrationServices(sourcePath, destPath);

    program = new Command().name('flow');
    registerSwitchCommand(program);
    registerSessionsCommand(program);
    registerBranchCommand(program);
    registerCompleteCommand(program);
  });

  afterEach(() => {
    sinon.restore();
    tempDir.cleanup();
  });

  it('prints the commands as name:description lines, leaving out hidden and deprecated ones', () => {
    runComplete([], program, integration.services);

    const names = output().map((line) => line.split(':')[0]);
    expect(names).toEqual(expect.arrayContaining(['switch', 'sessions']));
    expect(names).not.toContain('__complete');
    expect(names).not.toContain('tmux');
    expect(names).not.toContain('branch');
    expect(output()).toContain(`sessions:${program.commands.find((c) => c.name() === 'sessions')!.description()}`);
  });

  it('prints the workspace folders after switch, with their repo counts', async () => {
    const repo1 = await initGitRepo(sourcePath, 'repo1');
    const repo2 = await initGitRepo(sourcePath, 'repo2');
    for (const [branchName, repos] of [['feature/ABC-123', [repo1, repo2]], ['solo', [repo1]]] as const) {
      await createTestWorkspace(integration.useCases, {
        repos: [...repos],
        branchName,
        sourceBranch: 'master',
        sourcePath,
        destPath,
      });
    }

    runComplete(['switch'], program, integration.services);

    expect(output().sort()).toEqual(['feature_ABC-123:2 repos', 'solo:1 repo']);
  });

  it('prints nothing, without failing, when flow is not configured', () => {
    (integration.services.config.getRequired as sinon.SinonStub).throws(new ConfigNotSetError());

    runComplete(['switch'], program, integration.services);

    expect(output()).toEqual([]);
    sinon.assert.notCalled(integration.stubs.console.error as sinon.SinonStub);
    sinon.assert.notCalled(integration.stubs.process.exit as sinon.SinonStub);
  });
});
