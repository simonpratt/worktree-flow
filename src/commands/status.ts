import path from 'node:path';
import { Command } from 'commander';
import { createServices } from '../lib/services.js';
import { createUseCases } from '../usecases/usecases.js';
import type { Services } from '../lib/services.js';
import type { UseCases } from '../usecases/usecases.js';
import { resolveWorkspace } from '../lib/workspaceResolver.js';
import { logStatusFetching, logStatus } from './helpers.js';

export async function runStatus(
  branchName: string | undefined,
  useCases: UseCases,
  services: Services
): Promise<void> {
  const { sourcePath } = services.config.getRequired();
  const config = services.config.load();
  const { workspacePath } = resolveWorkspace(
    branchName,
    services.workspaceDir,
    services.config,
    services.process
  );

  const worktreeDirs = services.workspaceDir.getWorktreeDirs(workspacePath);

  if (worktreeDirs.length === 0) {
    services.console.log('\nNo worktrees found in workspace.');
    return;
  }

  const workspaceName = path.basename(workspacePath);
  const repoCount = worktreeDirs.length;

  // Phase 1: Show header with fetching indicator
  const loadingLines = logStatusFetching('Workspace:', [{ name: workspaceName, repoCount }], services.console);

  // Fetch workspace repos
  await useCases.fetchWorkspaceRepos.execute({
    workspacePath,
    sourcePath,
    fetchCacheTtlSeconds: config.fetchCacheTtlSeconds,
    silent: true,
  });

  const result = await useCases.checkWorkspaceStatus.execute({
    workspacePath,
  });

  // Load workspace config to get per-repo base branches
  const workspaceConfig = services.workspaceConfig.load(workspacePath);

  // Phase 2: Clear Phase 1 lines and re-render with full status
  logStatus(
    'Workspace:',
    [{ name: workspaceName, path: workspacePath, repoCount, isActive: false, statuses: result.statuses }],
    loadingLines,
    (_, repoName) => workspaceConfig.baseBranches[repoName] || 'master',
    services.console,
  );
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status [branch-name]')
    .description('Show status of all worktrees in a workspace (auto-detects from current directory if branch not provided)')
    .action(async (branchName?: string) => {
      const services = createServices();
      const useCases = createUseCases(services);

      try {
        await runStatus(branchName, useCases, services);
      } catch (error: any) {
        services.console.error(error.message);
        services.process.exit(1);
      }
    });
}
