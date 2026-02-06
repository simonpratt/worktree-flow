import * as sinon from 'sinon';
import type { IFileSystem, IShell, IConsole, IProcess } from '../adapters/types.js';

/**
 * Creates a mock filesystem using Sinon stubs
 */
export function createMockFileSystem(): sinon.SinonStubbedInstance<IFileSystem> {
  return {
    existsSync: sinon.stub(),
    readFileSync: sinon.stub(),
    writeFileSync: sinon.stub(),
    mkdirSync: sinon.stub(),
    readdirSync: sinon.stub() as any,
    copyFileSync: sinon.stub(),
    rmSync: sinon.stub(),
  };
}

/**
 * Creates a mock shell using Sinon stubs
 */
export function createMockShell(): sinon.SinonStubbedInstance<IShell> {
  return {
    execFile: sinon.stub(),
  };
}

/**
 * Creates a mock console using Sinon stubs
 */
export function createMockConsole(): sinon.SinonStubbedInstance<IConsole> {
  return {
    log: sinon.stub(),
    error: sinon.stub(),
    write: sinon.stub(),
  };
}

/**
 * Creates a mock process using Sinon stubs
 */
export function createMockProcess(): sinon.SinonStubbedInstance<IProcess> {
  return {
    exit: sinon.stub() as any,
    cwd: sinon.stub(),
  };
}
