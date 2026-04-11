import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createInterfaceMock } = vi.hoisted(() => ({
  createInterfaceMock: vi.fn(),
}));

vi.mock('node:readline', async () => {
  const actual = await vi.importActual<typeof import('node:readline')>('node:readline');

  return {
    ...actual,
    createInterface: createInterfaceMock,
  };
});

import { createPromptWithEscapeCodeTimeout } from '../createPromptWithEscapeCodeTimeout.js';

describe('createPromptWithEscapeCodeTimeout', () => {
  afterEach(() => {
    createInterfaceMock.mockReset();
  });

  it('creates readline with a low escape timeout so standalone esc resolves quickly', async () => {
    const input = new EventEmitter() as unknown as NodeJS.ReadableStream;
    const output = new PassThrough();
    const readlineEvents = new EventEmitter();

    createInterfaceMock.mockImplementation((options: unknown) => {
        const { input: rlInput, output: rlOutput } = options as {
          input: NodeJS.ReadableStream;
          output: NodeJS.WritableStream & {
            mute: () => void;
            unmute: () => void;
            write: (chunk: string) => boolean;
          };
        };

        return {
          input: rlInput,
          output: rlOutput,
          line: '',
          getCursorPos: () => ({ rows: 0, cols: 0 }),
          setPrompt: vi.fn(),
          clearLine: vi.fn(),
          on: readlineEvents.on.bind(readlineEvents),
          removeListener: readlineEvents.removeListener.bind(readlineEvents),
          close: () => {
            readlineEvents.emit('close');
          },
        } as any;
      });

    const prompt = createPromptWithEscapeCodeTimeout<string, { message: string }>(
      (config, done) => {
        done(config.message);
        return `? ${config.message}`;
      },
      25
    );

    await expect(prompt({ message: 'ok' }, { input, output })).resolves.toBe('ok');

    expect(createInterfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        terminal: true,
        input,
        escapeCodeTimeout: 25,
      })
    );
  });
});
