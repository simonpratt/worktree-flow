import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import type { IFileSystem } from '../adapters/types.js';
import { ConfigNotSetError } from './errors.js';

// Raw config schema (as stored in JSON)
const RawConfigSchema = z.object({
  'source-path': z.string().optional(),
  'dest-path': z.string().optional(),
  'copy-files': z.string().optional(),
  'tmux': z.enum(['true', 'false']).optional(),
  'main-branch': z.string().optional(),
  'post-checkout': z.string().optional(),
});

// Parsed config schema (with proper types)
const ParsedConfigSchema = z.object({
  sourcePath: z.string().optional(),
  destPath: z.string().optional(),
  copyFiles: z.string().default('.env'),
  tmux: z.boolean().default(false),
  mainBranch: z.string().default('master'),
  postCheckout: z.string().optional(),
});

// Required config schema (for getRequired)
const RequiredConfigSchema = z.object({
  sourcePath: z.string(),
  destPath: z.string(),
});

// Schema for setting individual config values
const ConfigValueSchemas = {
  'source-path': z.string().transform((val) => path.resolve(val)),
  'dest-path': z.string().transform((val) => path.resolve(val)),
  'copy-files': z.string(),
  'tmux': z.enum(['true', 'false']),
  'main-branch': z.string(),
  'post-checkout': z.string(),
} as const;

export type RawConfig = z.infer<typeof RawConfigSchema>;
export type ParsedConfig = z.infer<typeof ParsedConfigSchema>;
export type RequiredConfig = z.infer<typeof RequiredConfigSchema>;

export const CONFIG_KEYS = ['source-path', 'dest-path', 'copy-files', 'tmux', 'main-branch', 'post-checkout'] as const;
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

  load(): ParsedConfig {
    const raw = this.loadRaw();
    return ParsedConfigSchema.parse({
      sourcePath: raw['source-path'],
      destPath: raw['dest-path'],
      copyFiles: raw['copy-files'],
      tmux: raw.tmux === 'true',
      mainBranch: raw['main-branch'],
      postCheckout: raw['post-checkout'],
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
  getDisplayConfig(): Record<ConfigKey, { value: string; isDefault: boolean }> {
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
      'tmux': {
        value: raw.tmux ?? `${config.tmux} (default)`,
        isDefault: !raw.tmux,
      },
      'main-branch': {
        value: raw['main-branch'] ?? `${config.mainBranch} (default)`,
        isDefault: !raw['main-branch'],
      },
      'post-checkout': {
        value: raw['post-checkout'] ?? '(not set)',
        isDefault: !raw['post-checkout'],
      },
    };
  }
}
