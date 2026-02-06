/**
 * Adapter interfaces for I/O operations.
 * These abstractions allow business logic to be tested without real I/O.
 */

export interface IFileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: BufferEncoding): string;
  writeFileSync(path: string, content: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string, options: { withFileTypes: true }): any[];
  readdirSync(path: string, options?: { withFileTypes?: false }): string[];
  copyFileSync(src: string, dest: string): void;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

export interface IShell {
  execFile(
    command: string,
    args: string[],
    options?: { cwd?: string; encoding?: BufferEncoding }
  ): Promise<{ stdout: string; stderr: string }>;
}

export interface IConsole {
  log(message: string): void;
  error(message: string): void;
  write(message: string): void;
}

export interface IProcess {
  exit(code: number): never;
  cwd(): string;
}
