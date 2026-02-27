import path from 'node:path';
import { z } from 'zod';
import type { IFileSystem } from '../adapters/types.js';

const RepoConfigSchema = z.object({
  'copy-files': z.string().optional(),
  'post-checkout': z.string().optional(),
});

export type RepoConfig = {
  copyFiles: string | undefined;
  postCheckout: string | undefined;
};

/**
 * RepoConfigService handles loading per-repo flow-config.json files
 * from source repositories.
 */
export class RepoConfigService {
  constructor(private fs: IFileSystem) {}

  /**
   * Load flow-config.json from a repo's root directory.
   * Returns undefined if the file doesn't exist, is invalid JSON, or has no relevant fields.
   */
  load(repoPath: string): RepoConfig | undefined {
    const configPath = path.join(repoPath, 'flow-config.json');

    if (!this.fs.existsSync(configPath)) {
      return undefined;
    }

    try {
      const raw = this.fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = RepoConfigSchema.parse(parsed);

      const copyFiles = validated['copy-files'];
      const postCheckout = validated['post-checkout'];

      // Return undefined if no relevant fields are set
      if (!copyFiles && !postCheckout) {
        return undefined;
      }

      return { copyFiles, postCheckout };
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve the post-checkout command for a repo with 3-level precedence:
   * 1. per-repo-post-checkout from central config (highest priority)
   * 2. post-checkout from repo's flow-config.json
   * 3. global post-checkout from central config (lowest priority)
   */
  resolvePostCheckout(
    repoName: string,
    perRepoPostCheckout: Record<string, string> | undefined,
    repoConfig: RepoConfig | undefined,
    globalPostCheckout: string | undefined
  ): string | undefined {
    return (
      perRepoPostCheckout?.[repoName] ??
      repoConfig?.postCheckout ??
      globalPostCheckout
    );
  }

  /**
   * Resolve the copy-files for a repo with 2-level precedence:
   * 1. copy-files from repo's flow-config.json (overrides global)
   * 2. global copy-files from central config
   */
  resolveCopyFiles(
    repoConfig: RepoConfig | undefined,
    globalCopyFiles: string | undefined
  ): string | undefined {
    return repoConfig?.copyFiles ?? globalCopyFiles;
  }
}
