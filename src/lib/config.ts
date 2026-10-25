import path from 'node:path';
import os from 'node:os';
import * as z from 'zod/mini';
import en from 'zod/v4/locales/en.js';
import type { IFileSystem } from '../adapters/types.js';
import { ConfigNotSetError, InvalidWorkspacePathsError } from './errors.js';
import { SESSION_MANAGER_KINDS } from './sessionManager.js';

// zod/mini ships without error messages; load English so validation errors stay readable
z.config(en());

// Raw config schema (as stored in JSON)
const RawConfigSchema = z.object({
  'source-path': z.optional(z.string()),
  'dest-path': z.optional(z.string()),
  'copy-files': z.optional(z.string()),
  'session-manager': z.optional(z.enum(SESSION_MANAGER_KINDS)),
  /** Legacy: superseded by session-manager. `true` is read as session-manager tmux. */
  'tmux': z.optional(z.enum(['true', 'false'])),
  'post-checkout': z.optional(z.string()),
  'fetch-cache-ttl-seconds': z.optional(z.string()),
  'per-repo-post-checkout': z.optional(z.record(z.string(), z.string())),
  /** Named sets of repo names, used by `--group` and offered before the repo picker. */
  'repo-groups': z.optional(z.record(z.string(), z.array(z.string()))),
  /** Set once the user has been offered the herdr integration, so they aren't asked again. */
  'herdr-prompted': z.optional(z.enum(['true', 'false'])),
});

// Parsed config schema (with proper types)
const ParsedConfigSchema = z.object({
  sourcePath: z.optional(z.string()),
  destPath: z.optional(z.string()),
  copyFiles: z._default(z.string(), '.env'),
  sessionManager: z._default(z.enum(SESSION_MANAGER_KINDS), 'none'),
  postCheckout: z.optional(z.string()),
  fetchCacheTtlSeconds: z._default(z.number(), 300),
  perRepoPostCheckout: z._default(z.record(z.string(), z.string()), {}),
  repoGroups: z._default(z.record(z.string(), z.array(z.string())), {}),
  herdrPrompted: z._default(z.boolean(), false),
});

// Required config schema (for getRequired)
const RequiredConfigSchema = z.object({
  sourcePath: z.string(),
  destPath: z.string(),
});

// Schema for setting individual config values
const ConfigValueSchemas = {
  'source-path': z.pipe(z.string(), z.transform((val) => path.resolve(val))),
  'dest-path': z.pipe(z.string(), z.transform((val) => path.resolve(val))),
  'copy-files': z.string(),
  'session-manager': z.enum(SESSION_MANAGER_KINDS),
  'post-checkout': z.string(),
  'fetch-cache-ttl-seconds': z.string().check(
    z.refine(
      (val) => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num >= 0;
      },
      { message: 'Must be a non-negative integer' }
    )
  ),
} as const;

export type RawConfig = z.infer<typeof RawConfigSchema>;
export type ParsedConfig = z.infer<typeof ParsedConfigSchema>;
export type RequiredConfig = z.infer<typeof RequiredConfigSchema>;

export const CONFIG_KEYS = ['source-path', 'dest-path', 'copy-files', 'session-manager', 'post-checkout', 'fetch-cache-ttl-seconds'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/**
 * Pure utility functions (no I/O)
 */
export function validateAndTransformConfigValue(
  key: ConfigKey,
  value: string
): string {
  const schema = ConfigValueSchemas[key];
  return schema.parse(value);
}

/**
 * Workspaces live in a hidden folder inside the source-path by default, like worktrees inside a repo.
 * @example defaultDestPath('/home/me/dev') → '/home/me/dev/.workspaces'
 */
export function defaultDestPath(sourcePath: string): string {
  return path.join(sourcePath, '.workspaces');
}

/**
 * A dest-path may sit inside the source-path, but the two can't be the same folder,
 * and the source-path can't sit inside the dest-path.
 * @throws InvalidWorkspacePathsError
 */
export function validateWorkspacePaths(sourcePath: string, destPath: string): void {
  const source = path.resolve(sourcePath);
  const dest = path.resolve(destPath);
  if (source === dest) {
    throw new InvalidWorkspacePathsError('dest-path must be different from source-path.');
  }
  const sourceRelativeToDest = path.relative(dest, source);
  if (!sourceRelativeToDest.startsWith('..') && !path.isAbsolute(sourceRelativeToDest)) {
    throw new InvalidWorkspacePathsError('source-path must not be inside dest-path.');
  }
}

export function isValidKey(key: string): key is ConfigKey {
  return CONFIG_KEYS.includes(key as ConfigKey);
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.config', 'flow', 'config.json');
}

/**
 * ConfigService handles all configuration operations.
 */
export class ConfigService {
  constructor(private fs: IFileSystem) {}

  loadRaw(): RawConfig {
    const configPath = getConfigPath();
    if (!this.fs.existsSync(configPath)) {
      return {};
    }
    const raw = this.fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return RawConfigSchema.parse(parsed);
  }

  saveRaw(config: RawConfig): void {
    const configPath = getConfigPath();
    this.fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const validated = RawConfigSchema.parse(config);
    this.fs.writeFileSync(configPath, JSON.stringify(validated, null, 2) + '\n');
  }

  /** Merges the given values into the stored config. */
  set(values: RawConfig): void {
    this.saveRaw({ ...this.loadRaw(), ...values });
  }

  load(): ParsedConfig {
    const raw = this.loadRaw();
    return ParsedConfigSchema.parse({
      sourcePath: raw['source-path'],
      destPath: raw['dest-path'],
      copyFiles: raw['copy-files'],
      sessionManager: raw['session-manager'] ?? (raw.tmux === 'true' ? 'tmux' : undefined),
      postCheckout: raw['post-checkout'],
      fetchCacheTtlSeconds: raw['fetch-cache-ttl-seconds']
        ? parseInt(raw['fetch-cache-ttl-seconds'], 10)
        : undefined,
      perRepoPostCheckout: raw['per-repo-post-checkout'],
      repoGroups: raw['repo-groups'],
      herdrPrompted: raw['herdr-prompted'] === 'true',
    });
  }

  getRequired(): RequiredConfig {
    const config = this.load();

    const result = RequiredConfigSchema.safeParse({
      sourcePath: config.sourcePath,
      destPath: config.destPath,
    });

    if (!result.success) {
      throw new ConfigNotSetError(
        'flow is not configured. Run:\n' +
        '  flow config set source-path <path>\n' +
        '  flow config set dest-path <path>'
      );
    }

    return result.data;
  }

  /**
   * Get config display values (formatted for CLI output)
   */
  getDisplayConfig(): Record<ConfigKey, { value: string; isDefault: boolean }> & {
    perRepoPostCheckout: Record<string, string>;
  } {
    const raw = this.loadRaw();
    const config = this.load();

    return {
      'source-path': {
        value: raw['source-path'] ?? '(not set)',
        isDefault: !raw['source-path'],
      },
      'dest-path': {
        value: raw['dest-path'] ?? '(not set)',
        isDefault: !raw['dest-path'],
      },
      'copy-files': {
        value: raw['copy-files'] ?? `${config.copyFiles} (default)`,
        isDefault: !raw['copy-files'],
      },
      'session-manager': {
        value: raw['session-manager']
          ?? (raw.tmux === 'true' ? 'tmux (from legacy tmux setting)' : `${config.sessionManager} (default)`),
        isDefault: !raw['session-manager'] && raw.tmux !== 'true',
      },
      'post-checkout': {
        value: raw['post-checkout'] ?? '(not set)',
        isDefault: !raw['post-checkout'],
      },
      'fetch-cache-ttl-seconds': {
        value: raw['fetch-cache-ttl-seconds'] ?? `${config.fetchCacheTtlSeconds} (default)`,
        isDefault: !raw['fetch-cache-ttl-seconds'],
      },
      perRepoPostCheckout: config.perRepoPostCheckout,
    };
  }
}
