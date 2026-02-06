import path from 'node:path';
import type { IFileSystem } from '../adapters/types.js';

/**
 * RepoService handles repository discovery and operations.
 */
export class RepoService {
  constructor(private fs: IFileSystem) {}

  discoverRepos(sourcePath: string): string[] {
    const entries = this.fs.readdirSync(sourcePath, { withFileTypes: true });
    return entries
      .filter((entry: any) => entry.isDirectory())
      .map((entry: any) => path.join(sourcePath, entry.name))
      .filter((dirPath: string) => this.fs.existsSync(path.join(dirPath, '.git')))
      .sort();
  }

  static getRepoName(repoPath: string): string {
    return path.basename(repoPath);
  }
}
