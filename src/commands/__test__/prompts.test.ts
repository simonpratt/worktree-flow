import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { input, confirm, multiselect, pickRepos, type PromptStreams } from '../prompts.js';
import { PromptCancelledError } from '../../lib/errors.js';

const ENTER = '\r';
const ESC = '\x1b';
const TAB = '\t';
const SPACE = ' ';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const BACKSPACE = '\x7f';

/**
 * Drive a real clack prompt through in-memory streams, typing each key in turn.
 */
async function drive<T>(prompt: (streams: PromptStreams) => Promise<T>, keys: string[]): Promise<T> {
  const streams = { input: new PassThrough(), output: new PassThrough() };
  streams.output.resume();

  const result = prompt(streams);
  for (const key of keys) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    streams.input.write(key);
  }
  return result;
}

describe('input', () => {
  it('returns the default when submitted empty', async () => {
    const answer = await drive((s) => input({ message: 'Branch?', default: 'master' }, s), [ENTER]);

    expect(answer).toBe('master');
  });

  it('returns the typed value instead of the default', async () => {
    const answer = await drive((s) => input({ message: 'Branch?', default: 'master' }, s), ['d', 'e', 'v', ENTER]);

    expect(answer).toBe('dev');
  });

  it('pre-fills the default as editable text when prefill is editable', async () => {
    const answer = await drive(
      (s) => input({ message: 'Path?', default: '~/dev', prefill: 'editable' }, s),
      [BACKSPACE, BACKSPACE, BACKSPACE, 'x', ENTER]
    );

    expect(answer).toBe('~/x');
  });

  it('returns an empty string when submitted empty with no default', async () => {
    const answer = await drive((s) => input({ message: 'Command?' }, s), [ENTER]);

    expect(answer).toBe('');
  });

  it('throws PromptCancelledError when cancelled', async () => {
    await expect(drive((s) => input({ message: 'Branch?' }, s), [ESC])).rejects.toThrow(PromptCancelledError);
  });
});

describe('confirm', () => {
  it('returns the default when submitted untouched', async () => {
    expect(await drive((s) => confirm({ message: 'Sure?', default: true }, s), [ENTER])).toBe(true);
    expect(await drive((s) => confirm({ message: 'Sure?', default: false }, s), [ENTER])).toBe(false);
  });

  it('returns the toggled answer', async () => {
    const answer = await drive((s) => confirm({ message: 'Sure?', default: true }, s), [RIGHT, ENTER]);

    expect(answer).toBe(false);
  });

  it('throws PromptCancelledError when cancelled', async () => {
    await expect(drive((s) => confirm({ message: 'Sure?', default: true }, s), [ESC])).rejects.toThrow(
      PromptCancelledError
    );
  });
});

describe('multiselect', () => {
  const options = [
    { value: 'one', label: 'One' },
    { value: 'two', label: 'Two' },
  ];

  it('returns the toggled values', async () => {
    const selected = await drive((s) => multiselect({ message: 'Pick', options }, s), [DOWN, SPACE, ENTER]);

    expect(selected).toEqual(['two']);
  });

  it('allows submitting with nothing selected', async () => {
    const selected = await drive((s) => multiselect({ message: 'Pick', options }, s), [ENTER]);

    expect(selected).toEqual([]);
  });

  it('throws PromptCancelledError when cancelled', async () => {
    await expect(drive((s) => multiselect({ message: 'Pick', options }, s), [ESC])).rejects.toThrow(
      PromptCancelledError
    );
  });
});

describe('pickRepos', () => {
  const options = [
    { value: '/source/alpha', label: 'alpha' },
    { value: '/source/beta', label: 'beta' },
    { value: '/source/gamma', label: 'gamma' },
  ];

  const run = (keys: string[], initialValues: string[] = []) =>
    drive((s) => pickRepos({ message: 'Select repos', options, initialValues }, s), keys);

  it('filters the list by the typed search term and toggles the match with tab', async () => {
    expect(await run(['be', TAB, ENTER])).toEqual(['/source/beta']);
  });

  it('keeps earlier selections when the search term changes', async () => {
    expect(await run(['al', TAB, BACKSPACE + BACKSPACE, 'ga', TAB, ENTER])).toEqual(['/source/alpha', '/source/gamma']);
  });

  it('returns the pre-selected repos when submitted untouched', async () => {
    expect(await run([ENTER], ['/source/gamma'])).toEqual(['/source/gamma']);
  });

  it('throws PromptCancelledError when cancelled', async () => {
    await expect(run([ESC], ['/source/gamma'])).rejects.toThrow(PromptCancelledError);
  });
});
