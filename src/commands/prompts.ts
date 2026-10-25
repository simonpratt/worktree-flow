import type { Readable, Writable } from 'node:stream';
import { PromptCancelledError } from '../lib/errors.js';

/**
 * Interactive prompts used by the commands. Each one throws PromptCancelledError
 * when the user cancels (Esc / Ctrl+C), so callers never see clack's cancel symbol.
 */

/** clack (and the readline/tty modules it pulls in) loads on first prompt, keeping it off non-interactive startup. */
const loadClack = () => import('@clack/prompts');

/** Override stdin/stdout, used to drive the prompts in tests. */
export type PromptStreams = { input?: Readable; output?: Writable };

export type InputOptions = {
  message: string;
  /** Returned when submitted empty, or pre-filled when `prefill` is 'editable'. */
  default?: string;
  prefill?: 'editable';
};

export type ConfirmOptions = { message: string; default: boolean };

export type MultiselectOptions = {
  message: string;
  options: Array<{ value: string; label: string }>;
};

export type RepoPickerOptions = MultiselectOptions & { initialValues: string[] };

function unlessCancelled<T>(clack: typeof import('@clack/prompts'), answer: T): Exclude<T, symbol> {
  if (clack.isCancel(answer)) {
    throw new PromptCancelledError();
  }
  return answer as Exclude<T, symbol>;
}

export async function input(
  { message, default: defaultValue, prefill }: InputOptions,
  streams: PromptStreams = {}
): Promise<string> {
  const clack = await loadClack();
  const answer = await clack.text({
    message,
    ...(prefill === 'editable'
      ? { initialValue: defaultValue }
      : { placeholder: defaultValue, defaultValue }),
    ...streams,
  });

  return unlessCancelled(clack, answer) ?? '';
}

export async function confirm(
  { message, default: initialValue }: ConfirmOptions,
  streams: PromptStreams = {}
): Promise<boolean> {
  const clack = await loadClack();
  return unlessCancelled(clack, await clack.confirm({ message, initialValue, ...streams }));
}

export async function multiselect(
  { message, options }: MultiselectOptions,
  streams: PromptStreams = {}
): Promise<string[]> {
  const clack = await loadClack();
  return unlessCancelled(
      clack,
    await clack.multiselect({ message, options, required: false, maxItems: 20, ...streams })
  );
}

/**
 * Searchable multi-select repo picker. Returns the selected repo paths.
 */
export async function pickRepos(
  { message, options, initialValues }: RepoPickerOptions,
  streams: PromptStreams = {}
): Promise<string[]> {
  const clack = await loadClack();
  return unlessCancelled(
      clack,
    await clack.autocompleteMultiselect({
      message,
      options,
      initialValues,
      placeholder: 'Type to search...',
      maxItems: 20,
      ...streams,
    })
  );
}
