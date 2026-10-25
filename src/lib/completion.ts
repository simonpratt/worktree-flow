/** A command as the completion sees it, e.g. from commander's visible commands. */
export type CompletionCommand = { name: string; description: string; group?: string };

export type CompletionWorkspace = { name: string; repoCount: number };

/** Lookups for the candidates, called only when the words typed so far need them. */
export type CompletionSources = {
  commands: () => CompletionCommand[];
  workspaces: () => CompletionWorkspace[];
};

export type CompletionCandidate = { value: string; description: string };

const DEPRECATED_GROUP = 'Deprecated';

/** Commands whose first argument is a workspace name. */
const WORKSPACE_COMMANDS = ['switch'];

/**
 * Returns the candidates for the next word, given the words typed after `flow`.
 * @example complete([], sources) → the commands
 * @example complete(['switch'], sources) → the workspaces, e.g. { value: 'feature_x', description: '2 repos' }
 */
export function complete(words: string[], sources: CompletionSources): CompletionCandidate[] {
  if (words.length === 0) {
    return sources
      .commands()
      .filter((command) => command.group !== DEPRECATED_GROUP)
      .map(({ name, description }) => ({ value: name, description }));
  }

  if (words.length === 1 && WORKSPACE_COMMANDS.includes(words[0])) {
    return sources.workspaces().map(({ name, repoCount }) => ({
      value: name,
      description: `${repoCount} repo${repoCount === 1 ? '' : 's'}`,
    }));
  }

  return [];
}

/**
 * Formats a candidate as a line for zsh's `_describe`, which splits on the first
 * unescaped colon.
 * @example formatCandidate({ value: 'a:b', description: 'x' }) → 'a\:b:x'
 */
export function formatCandidate({ value, description }: CompletionCandidate): string {
  return `${value.replace(/:/g, '\\:')}:${description.replace(/\s+/g, ' ')}`;
}

/** The zsh completion file printed by `flow completion zsh`. */
export const ZSH_COMPLETION = `#compdef flow
local -a items
items=(\${(f)"$(flow __complete -- "\${(@)words[2,CURRENT-1]}" 2>/dev/null)"})
_describe 'flow' items
`;
