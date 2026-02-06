/**
 * Production adapters using real Node.js APIs.
 */

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IFileSystem, IShell, IConsole, IProcess } from './types.js';

const execFileAsync = promisify(execFile);

export class NodeFileSystem implements IFileSystem {
  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  readFileSync(path: string, encoding: BufferEncoding): string {
    return fs.readFileSync(path, encoding);
  }

  writeFileSync(path: string, content: string): void {
    fs.writeFileSync(path, content);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(path, options);
  }

  readdirSync(path: string, options: { withFileTypes: true }): any[];
  readdirSync(path: string, options?: { withFileTypes?: false }): string[];
  readdirSync(path: string, options?: any): any {
    return fs.readdirSync(path, options);
  }

  copyFileSync(src: string, dest: string): void {
    fs.copyFileSync(src, dest);
  }

  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    fs.rmSync(path, options);
  }
}

export class NodeShell implements IShell {
  async execFile(
    command: string,
    args: string[],
    options?: { cwd?: string; encoding?: BufferEncoding }
  ): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync(command, args, {
      ...options,
      encoding: options?.encoding || 'utf-8',
    });
    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  }
}

export class NodeConsole implements IConsole {
  log(message: string): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(message);
  }

  write(message: string): void {
    process.stdout.write(message);
  }
}

export class NodeProcess implements IProcess {
  exit(code: number): never {
    process.exit(code);
  }

  cwd(): string {
    return process.cwd();
  }
}
