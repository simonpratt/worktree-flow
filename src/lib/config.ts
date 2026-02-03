import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

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

// Required config schema (for getRequiredConfig)
const RequiredConfigSchema = z.object({
  sourcePath: z.string(),
  destPath: z.string(),
});

// Schema for setting individual config values - transforms input to storage format
// Each schema validates the input and applies necessary transformations:
// - Paths are resolved to absolute paths
// - Boolean values are validated as string enums
// - Other values are validated as strings
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
 * Validates and transforms a config value for storage.
 * - Paths are automatically resolved to absolute paths
 * - Boolean values must be 'true' or 'false' strings
 * - Throws ZodError if validation fails
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

export function loadRawConfig(): RawConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return RawConfigSchema.parse(parsed);
}

export function saveRawConfig(config: RawConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const validated = RawConfigSchema.parse(config);
  fs.writeFileSync(configPath, JSON.stringify(validated, null, 2) + '\n');
}

export function loadConfig(): ParsedConfig {
  const raw = loadRawConfig();
  return ParsedConfigSchema.parse({
    sourcePath: raw['source-path'],
    destPath: raw['dest-path'],
    copyFiles: raw['copy-files'],
    tmux: raw.tmux === 'true',
    mainBranch: raw['main-branch'],
    postCheckout: raw['post-checkout'],
  });
}

export function getRequiredConfig(): RequiredConfig {
  const config = loadConfig();

  const result = RequiredConfigSchema.safeParse({
    sourcePath: config.sourcePath,
    destPath: config.destPath,
  });

  if (!result.success) {
    console.error(
      'flow is not configured. Run:\n' +
      '  flow config set source-path <path>\n' +
      '  flow config set dest-path <path>'
    );
    process.exit(1);
  }

  return result.data;
}
