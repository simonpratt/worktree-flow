import * as git from "./git.js";

export type WorktreeStatus = {
  type: "clean" | "uncommitted" | "ahead" | "behind" | "diverged" | "error";
  error?: string;
  comparedTo?: "origin" | "main";
};

export async function getWorktreeStatus(
  worktreePath: string,
  mainBranch: string,
): Promise<WorktreeStatus> {
  try {
    // Always check for uncommitted changes first
    const hasUncommitted = await git.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      return { type: "uncommitted" };
    }

    // Check if origin branch exists
    const hasOriginBranch = await git.originBranchExists(worktreePath);

    if (hasOriginBranch) {
      // Compare against origin branch
      const isAhead = await git.isAheadOfOrigin(worktreePath);
      const isBehind = await git.isBehindOrigin(worktreePath);

      if (isAhead && isBehind) {
        return { type: "diverged", comparedTo: "origin" };
      }
      if (isAhead) {
        return { type: "ahead", comparedTo: "origin" };
      }
      if (isBehind) {
        return { type: "behind", comparedTo: "origin" };
      }

      return { type: "clean", comparedTo: "origin" };
    }

    // No origin branch, compare against main
    const isAhead = await git.isAheadOfMain(worktreePath, mainBranch);
    if (isAhead) {
      return { type: "ahead", comparedTo: "main" };
    }

    return { type: "clean", comparedTo: "main" };
  } catch (err: any) {
    return {
      type: "error",
      error: err.stderr || err.message,
    };
  }
}

export function getStatusMessage(
  status: WorktreeStatus,
  mainBranch: string,
): string {
  switch (status.type) {
    case "clean":
      return "up to date";
    case "uncommitted":
      return "uncommitted changes";
    case "ahead":
      return status.comparedTo === "origin"
        ? "ahead of origin"
        : `ahead of ${mainBranch}`;
    case "behind":
      return "behind origin";
    case "diverged":
      return "diverged from origin";
    case "error":
      return `error: ${status.error}`;
  }
}

export function hasIssues(status: WorktreeStatus): boolean {
  return (
    status.type === "uncommitted" ||
    status.type === "ahead" ||
    status.type === "diverged" ||
    status.type === "error"
  );
}
