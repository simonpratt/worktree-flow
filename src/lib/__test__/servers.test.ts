import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { ServerService } from '../servers.js';
import { createMockShell } from '../../test/test-utils.js';

/** lsof's -F output: one field per line, each prefixed with its field letter. */
const fields = (...lines: string[]) => lines.join('\n');

describe('ServerService', () => {
  let shell: ReturnType<typeof createMockShell>;
  let service: ServerService;

  /** Fakes lsof, answering the listening-socket and cwd queries from canned output. */
  function fakeLsof(listening: string, cwds: string) {
    shell.execFile.callsFake(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('lsof');
      if (args.includes('-sTCP:LISTEN')) return { stdout: listening, stderr: '' };
      if (args.includes('cwd')) return { stdout: cwds, stderr: '' };
      throw new Error(`unexpected lsof call: ${args.join(' ')}`);
    });
  }

  beforeEach(() => {
    shell = createMockShell();
    service = new ServerService(shell);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('lists each listening process once, with its process group, parent, ports and working directory', async () => {
    fakeLsof(
      fields(
        'p101', 'g100', 'R100', 'cnode', 'f20', 'n*:3000', 'f21', 'n[::1]:3000', 'f22', 'n127.0.0.1:9229',
        'p202', 'g202', 'R1', 'cpostgres', 'f5', 'nlocalhost:5432'
      ),
      fields('p101', 'fcwd', 'n/dev/.workspaces/feature_a/web', 'p202', 'fcwd', 'n/usr/local/var/postgres')
    );

    const servers = await service.listListening();

    expect(servers).toEqual([
      { pid: 101, pgid: 100, ppid: 100, command: 'node', ports: [3000, 9229], cwd: '/dev/.workspaces/feature_a/web' },
      { pid: 202, pgid: 202, ppid: 1, command: 'postgres', ports: [5432], cwd: '/usr/local/var/postgres' },
    ]);
  });

  it('asks for the working directories of only the listening processes', async () => {
    fakeLsof(fields('p101', 'cnode', 'f20', 'n*:3000', 'p202', 'cruby', 'f9', 'n*:4000'), '');

    await service.listListening();

    const cwdCall = shell.execFile.getCalls().find((c: any) => c.args[1].includes('cwd'))!;
    const args: string[] = cwdCall.args[1];
    expect(args[args.indexOf('-p') + 1]).toBe('101,202');
  });

  it('skips processes whose working directory cannot be read', async () => {
    fakeLsof(
      fields('p101', 'cnode', 'f20', 'n*:3000', 'p202', 'claunchd', 'f9', 'n*:4000'),
      fields('p101', 'fcwd', 'n/dev/web')
    );

    const servers = await service.listListening();

    expect(servers.map((s) => s.pid)).toEqual([101]);
  });

  it('returns nothing, without a second lookup, when nothing is listening', async () => {
    // lsof exits non-zero when it finds no matching files
    shell.execFile.rejects(Object.assign(new Error('Command failed: lsof'), { code: 1, stdout: '', stderr: '' }));

    expect(await service.listListening()).toEqual([]);
    sinon.assert.calledOnce(shell.execFile);
  });

  it('keeps the results lsof printed even when it exits non-zero', async () => {
    // e.g. some processes belong to other users and can't be inspected
    shell.execFile.callsFake(async (_cmd: string, args: string[]) => {
      const stdout = args.includes('cwd')
        ? fields('p101', 'fcwd', 'n/dev/web')
        : fields('p101', 'cnode', 'f20', 'n*:3000');
      throw Object.assign(new Error('Command failed: lsof'), { code: 1, stdout, stderr: 'permission denied' });
    });

    expect(await service.listListening()).toEqual([{ pid: 101, command: 'node', ports: [3000], cwd: '/dev/web' }]);
  });

  it('explains when lsof is not installed', async () => {
    shell.execFile.rejects(Object.assign(new Error('spawn lsof ENOENT'), { code: 'ENOENT' }));

    await expect(service.listListening()).rejects.toThrow('lsof is needed to find running servers');
  });
});
