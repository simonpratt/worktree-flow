import { RepoService } from '../lib/repos.js';
import type { GitService } from '../lib/git.js';

export type CreateBranchParams = {
  repoPath: string;
  branchName: string;
  sourceBranch: string;
};

export type CreateBranchResult = {
  repoName: string;
  baseBranch: string; // the actual base branch used (after fallback)
};

const DEFAULT_BRANCH_CANDIDATES = ['master', 'main', 'trunk', 'develop'];

/**
 * Use case for creating a git branch in a single repo.
 * Handles fallback to default branches when the source branch doesn't exist.
 */
export class CreateBranchUseCase {
  constructor(private git: GitService) {}

  async execute(params: CreateBranchParams): Promise<CreateBranchResult> {
    const repoName = RepoService.getRepoName(params.repoPath);

    // 1. Check if the source branch exists as a remote-tracking branch
    const sourceBranchExists = await this.git.localRemoteBranchExists(
      params.repoPath,
      params.sourceBranch
    );

    let actualBaseBranch = params.sourceBranch;

    // 2. Fall back to first existing default branch if source branch doesn't exist
    if (!sourceBranchExists) {
      const fallback = await this.git.findFirstExistingBranch(
        params.repoPath,
        DEFAULT_BRANCH_CANDIDATES
      );

      if (fallback === null) {
        throw new Error(
          `Cannot create branch in ${repoName}: source branch "${params.sourceBranch}" not found and no fallback branch exists (tried: ${DEFAULT_BRANCH_CANDIDATES.join(', ')})`
        );
      }

      actualBaseBranch = fallback;
    }

    // 3. Create the branch from origin/<actualBaseBranch>
    await this.git.createBranch(params.repoPath, params.branchName, `origin/${actualBaseBranch}`);

    // 4. Return the actual base branch used
    return {
      repoName,
      baseBranch: actualBaseBranch,
    };
  }
}
