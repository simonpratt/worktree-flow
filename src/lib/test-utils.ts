import * as sinon from 'sinon';
import { Volume } from 'memfs';
import type { IFileSystem, IShell, IConsole, IProcess } from '../adapters/types.js';

/**
 * Creates an in-memory filesystem using memfs
 */
export function createMemFs(files: Record<string, string> = {}) {
  const vol = Volume.fromJSON(files);
  return { vol, fs: vol as unknown as IFileSystem };
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
