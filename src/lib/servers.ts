import type { IShell } from '../adapters/types.js';

export type Server = {
  pid: number;
  /** Process group id, shared with the command that started it (e.g. npm run dev), if known */
  pgid?: number;
  /** Parent process id, e.g. the shell that started it in the background, if known */
  ppid?: number;
  command: string;
  /** TCP ports it listens on, ascending */
  ports: number[];
  cwd: string;
};

type LsofProcess = { pid: number; pgid?: number; ppid?: number; command?: string; names: string[] };

/**
 * Parses lsof's -F output, where each line is a field letter then its value,
 * and a `p` line starts the next process.
 * @example parseLsof('p1\ncnode\nf20\nn*:3000') → [{ pid: 1, command: 'node', names: ['*:3000'] }]
 */
function parseLsof(output: string): LsofProcess[] {
  const processes: LsofProcess[] = [];
  for (const line of output.split('\n')) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      processes.push({ pid: Number(value), names: [] });
    } else if (processes.length > 0) {
      const current = processes[processes.length - 1];
      if (field === 'g') current.pgid = Number(value);
      if (field === 'R') current.ppid = Number(value);
      if (field === 'c') current.command = value;
      if (field === 'n') current.names.push(value);
    }
  }
  return processes;
}

/**
 * Finds the processes listening on TCP ports (local dev servers, databases, ...)
 * via lsof, which works the same on macOS and Linux.
 */
export class ServerService {
  constructor(private shell: IShell) {}

  /** Runs lsof, keeping what it printed even when it exits non-zero (no matches, or unreadable processes). */
  private async lsof(args: string[]): Promise<string> {
    try {
      return (await this.shell.execFile('lsof', args)).stdout;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('lsof is needed to find running servers, but it is not installed.');
      }
      return typeof error.stdout === 'string' ? error.stdout : '';
    }
  }

  async listListening(): Promise<Server[]> {
    // +c 0 prints full command names (macOS truncates them to 9 characters otherwise)
    const listening = parseLsof(await this.lsof(['-nP', '-R', '+c', '0', '-iTCP', '-sTCP:LISTEN', '-FpgRcn']));
    if (listening.length === 0) return [];

    const cwdOutput = await this.lsof(['-a', '-d', 'cwd', '-p', listening.map((p) => p.pid).join(','), '-Fn']);
    const cwds = new Map(parseLsof(cwdOutput).map((p) => [p.pid, p.names[0]]));

    return listening.flatMap(({ pid, pgid, ppid, command, names }) => {
      const cwd = cwds.get(pid);
      if (!cwd) return [];
      // Names are host:port, e.g. *:3000, [::1]:3000 or 127.0.0.1:9229
      const ports = [...new Set(names.map((name) => Number(name.slice(name.lastIndexOf(':') + 1))))]
        .filter((port) => !Number.isNaN(port))
        .sort((a, b) => a - b);
      return [
        { pid, ...(pgid === undefined ? {} : { pgid }), ...(ppid === undefined ? {} : { ppid }), command: command ?? '', ports, cwd },
      ];
    });
  }
}
