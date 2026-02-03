import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface FlowtreeConfig {
  'source-path'?: string;
  'dest-path'?: string;
  'config-files'?: string;
}

const VALID_KEYS: (keyof FlowtreeConfig)[] = ['source-path', 'dest-path', 'config-files'];

export function isValidKey(key: string): key is keyof FlowtreeConfig {
  return VALID_KEYS.includes(key as keyof FlowtreeConfig);
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.config', 'flow', 'config.json');
}

export function loadConfig(): FlowtreeConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

export function saveConfig(config: FlowtreeConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function getRequiredConfig(): { sourcePath: string; destPath: string } {
  const config = loadConfig();
  if (!config['source-path'] || !config['dest-path']) {
    console.error(
      'flow is not configured. Run:\n' +
      '  flow config set source-path <path>\n' +
      '  flow config set dest-path <path>'
    );
    process.exit(1);
  }
  return {
    sourcePath: config['source-path'],
    destPath: config['dest-path'],
  };
}
