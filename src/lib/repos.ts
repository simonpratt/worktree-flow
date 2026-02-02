import fs from 'node:fs';
import path from 'node:path';

export function discoverRepos(sourcePath: string): string[] {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(sourcePath, entry.name))
    .filter(dirPath => fs.existsSync(path.join(dirPath, '.git')))
    .sort();
}

export function getRepoName(repoPath: string): string {
  return path.basename(repoPath);
}
