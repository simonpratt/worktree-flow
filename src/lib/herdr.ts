import type { IShell } from '../adapters/types.js';
import {
  SessionExistsError,
  runPaneCommands,
  type PaneCommandResult,
  type SessionManager,
  type SessionPane,
} from './sessionManager.js';

const ROOT_TAB = 'root';
const REPOS_TAB = 'repos';
const SERVER_START_ATTEMPTS = 40;
const SERVER_START_INTERVAL_MS = 250;

type Rect = { width: number; height: number };

export class HerdrError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HerdrError';
  }
}

/**
 * Herdr workspaces, labelled with the workspace's branch name. Each has a "root"
 * tab split in half at the workspace root, and a "repos" tab with a pane per
 * worktree. Herdr's own ids (w1, w1:p2) are assigned per server, so workspaces
 * are always looked up by label.
 */
export class HerdrService implements SessionManager {
  readonly label = 'herdr';

  constructor(
    private shell: IShell,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  /** Runs a herdr CLI command and returns its JSON `result`. */
  private async call(args: string[]): Promise<any> {
    let stdout: string;
    try {
      ({ stdout } = await this.shell.execFile('herdr', args));
    } catch (error: any) {
      // herdr prints a JSON error (to stderr) and exits non-zero
      const parsed = this.tryParse(error.stderr) ?? this.tryParse(error.stdout);
      if (parsed?.error) {
        throw new HerdrError(parsed.error.code, parsed.error.message);
      }
      throw error;
    }
    const parsed = this.tryParse(stdout);
    if (parsed?.error) {
      throw new HerdrError(parsed.error.code, parsed.error.message);
    }
    return parsed?.result;
  }

  private tryParse(text: unknown): any {
    if (typeof text !== 'string') return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  /** Returns the id of the workspace labelled `name`, or undefined if there's none (or no server). */
  private async findWorkspaceId(name: string): Promise<string | undefined> {
    try {
      const { workspaces } = await this.call(['workspace', 'list']);
      return workspaces.find((w: any) => w.label === name)?.workspace_id;
    } catch (error) {
      if (error instanceof HerdrError && error.code === 'server_not_running') {
        return undefined;
      }
      throw error;
    }
  }

  /** Starts a headless herdr server if one isn't running, like tmux does for new-session. */
  private async ensureServer(): Promise<void> {
    const isRunning = async () => {
      try {
        await this.call(['workspace', 'list']);
        return true;
      } catch (error) {
        if (error instanceof HerdrError && error.code === 'server_not_running') {
          return false;
        }
        throw error;
      }
    };

    if (await isRunning()) return;

    this.shell.spawnDetached('herdr', ['server']);
    for (let attempt = 0; attempt < SERVER_START_ATTEMPTS; attempt++) {
      await this.sleep(SERVER_START_INTERVAL_MS);
      if (await isRunning()) return;
    }
    throw new Error('Timed out waiting for the herdr server to start');
  }

  private async split(paneId: string, direction: 'right' | 'down', cwd: string, ratio?: number): Promise<string> {
    const result = await this.call([
      'pane',
      'split',
      paneId,
      '--direction',
      direction,
      ...(ratio === undefined ? [] : ['--ratio', ratio.toFixed(4)]),
      '--cwd',
      cwd,
      '--no-focus',
    ]);
    return result.pane.pane_id;
  }

  /**
   * Creates the repos tab with the panes laid out in an even grid (row-major,
   * at least as many columns as rows). Returns pane ids in the order given.
   */
  private async createReposTab(workspaceId: string, panes: SessionPane[]): Promise<string[]> {
    if (panes.length === 0) return [];

    const tab = await this.call([
      'tab',
      'create',
      '--workspace',
      workspaceId,
      '--cwd',
      panes[0].path,
      '--label',
      REPOS_TAB,
      '--no-focus',
    ]);

    const cols = Math.ceil(Math.sqrt(panes.length));
    const rows = Math.ceil(panes.length / cols);
    const ids: string[] = new Array(panes.length);

    // A split keeps `ratio` of the pane for itself, so keeping 1/remaining each
    // time gives every row (then every column within a row) an equal share
    const rowHeads = [tab.root_pane.pane_id];
    for (let row = 1; row < rows; row++) {
      rowHeads.push(await this.split(rowHeads[row - 1], 'down', panes[row * cols].path, 1 / (rows - row + 1)));
    }

    for (let row = 0; row < rows; row++) {
      const start = row * cols;
      const count = Math.min(cols, panes.length - start);
      ids[start] = rowHeads[row];
      for (let col = 1; col < count; col++) {
        ids[start + col] = await this.split(ids[start + col - 1], 'right', panes[start + col].path, 1 / (count - col + 1));
      }
    }

    return ids;
  }

  /** Adds panes to an existing repos tab, each time halving its largest pane. */
  private async extendReposTab(workspaceId: string, tabId: string, panes: SessionPane[]): Promise<string[]> {
    const { panes: workspacePanes } = await this.call(['pane', 'list', '--workspace', workspaceId]);
    const anchor = workspacePanes.find((p: any) => p.tab_id === tabId)?.pane_id;
    if (!anchor) {
      return this.createReposTab(workspaceId, panes);
    }

    const ids: string[] = [];
    for (const pane of panes) {
      const { layout } = await this.call(['pane', 'layout', '--pane', anchor]);
      const area = (r: Rect) => r.width * r.height;
      const largest = layout.panes.reduce((a: any, b: any) => (area(b.rect) > area(a.rect) ? b : a));
      // Terminal cells are roughly twice as tall as wide
      const direction = largest.rect.width >= largest.rect.height * 2 ? 'right' : 'down';
      ids.push(await this.split(largest.pane_id, direction, pane.path));
    }
    return ids;
  }

  private runCommands(panes: SessionPane[], ids: string[]): Promise<PaneCommandResult[]> {
    return runPaneCommands(
      panes.map((pane, i) => ({ ...pane, target: ids[i] })),
      async (paneId, command) => {
        await this.call(['pane', 'run', paneId, command]);
      }
    );
  }

  async isInstalled(): Promise<boolean> {
    try {
      await this.shell.execFile('which', ['herdr']);
      return true;
    } catch {
      return false;
    }
  }

  async exists(name: string): Promise<boolean> {
    return (await this.findWorkspaceId(name)) !== undefined;
  }

  async create(name: string, rootPath: string, panes: SessionPane[]): Promise<PaneCommandResult[]> {
    await this.ensureServer();
    if (await this.findWorkspaceId(name)) {
      throw new SessionExistsError(name);
    }

    const created = await this.call(['workspace', 'create', '--cwd', rootPath, '--label', name, '--no-focus']);
    const workspaceId = created.workspace.workspace_id;

    await this.call(['tab', 'rename', created.tab.tab_id, ROOT_TAB]);
    await this.split(created.root_pane.pane_id, 'right', rootPath);

    const ids = await this.createReposTab(workspaceId, panes);
    return this.runCommands(panes, ids);
  }

  async addPanes(name: string, panes: SessionPane[]): Promise<PaneCommandResult[]> {
    if (panes.length === 0) return [];

    const workspaceId = await this.findWorkspaceId(name);
    if (!workspaceId) {
      throw new Error(`herdr workspace not found: ${name}`);
    }

    const { tabs } = await this.call(['tab', 'list', '--workspace', workspaceId]);
    const reposTab = tabs.find((t: any) => t.label === REPOS_TAB);
    const ids = reposTab
      ? await this.extendReposTab(workspaceId, reposTab.tab_id, panes)
      : await this.createReposTab(workspaceId, panes);

    return this.runCommands(panes, ids);
  }

  async close(name: string): Promise<boolean> {
    const workspaceId = await this.findWorkspaceId(name);
    if (!workspaceId) return false;
    await this.call(['workspace', 'close', workspaceId]);
    return true;
  }

  async rename(oldName: string, newName: string): Promise<boolean> {
    const workspaceId = await this.findWorkspaceId(oldName);
    if (!workspaceId) return false;
    await this.call(['workspace', 'rename', workspaceId, newName]);
    return true;
  }
}
