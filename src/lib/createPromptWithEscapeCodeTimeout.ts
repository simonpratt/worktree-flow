import * as readline from 'node:readline';
import { AsyncResource } from 'node:async_hooks';
import MuteStream from 'mute-stream';
import { onExit as onSignalExit } from 'signal-exit';
import type { InquirerReadline } from '@inquirer/type';
import ScreenManager from '../../node_modules/@inquirer/core/dist/lib/screen-manager.js';
import { PromisePolyfill } from '../../node_modules/@inquirer/core/dist/lib/promise-polyfill.js';
import { withHooks, effectScheduler } from '../../node_modules/@inquirer/core/dist/lib/hook-engine.js';
import {
  AbortPromptError,
  CancelPromptError,
  ExitPromptError,
} from '../../node_modules/@inquirer/core/dist/lib/errors.js';

type PromptContext = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  signal?: AbortSignal;
  clearPromptOnDone?: boolean;
};

type PromptReturnValue = string | [string, string?];

export function createPromptWithEscapeCodeTimeout<Value, Config>(
  view: (config: Config, done: (value: Value) => void) => PromptReturnValue,
  escapeCodeTimeout: number
): (config: Config, context?: PromptContext) => Promise<Value> & { cancel: () => void } {
  return (config: Config, context: PromptContext = {}) => {
    const { input = process.stdin, signal } = context;
    const cleanups = new Set<() => void>();

    const output = new MuteStream() as unknown as NodeJS.WritableStream & {
      pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
      end(): void;
    };
    output.pipe(context.output ?? process.stdout);

    const rl = readline.createInterface(
      {
        terminal: true,
        input: input as NodeJS.ReadableStream,
        output: output as NodeJS.WritableStream,
        escapeCodeTimeout,
      } as readline.ReadLineOptions
    ) as unknown as InquirerReadline;

    const screen = new ScreenManager(rl);
    const { promise, resolve, reject } = PromisePolyfill.withResolver<Value>();
    const cancel = () => reject(new CancelPromptError());

    if (signal) {
      const abort = () => reject(new AbortPromptError({ cause: signal.reason }));
      if (signal.aborted) {
        abort();
        return Object.assign(promise, { cancel });
      }

      signal.addEventListener('abort', abort);
      cleanups.add(() => signal.removeEventListener('abort', abort));
    }

    cleanups.add(
      onSignalExit((code, receivedSignal) => {
        reject(new ExitPromptError(`User force closed the prompt with ${code} ${receivedSignal}`));
      })
    );

    const sigint = () => reject(new ExitPromptError('User force closed the prompt with SIGINT'));
    rl.on('SIGINT', sigint);
    cleanups.add(() => rl.removeListener('SIGINT', sigint));

    const checkCursorPos = () => screen.checkCursorPos();
    rl.input.on('keypress', checkCursorPos);
    cleanups.add(() => rl.input.removeListener('keypress', checkCursorPos));

    return withHooks(rl, (cycle) => {
      const hooksCleanup = AsyncResource.bind(() => effectScheduler.clearAll());
      rl.on('close', hooksCleanup);
      cleanups.add(() => rl.removeListener('close', hooksCleanup));

      cycle(() => {
        try {
          const nextView = view(config, (value) => {
            setImmediate(() => resolve(value));
          });

          if (nextView === undefined) {
            throw new Error('Prompt functions must return a string.');
          }

          const [content, bottomContent] = typeof nextView === 'string' ? [nextView] : nextView;
          screen.render(content, bottomContent);
          effectScheduler.run();
        } catch (error) {
          reject(error);
        }
      });

      return Object.assign(
        promise
          .then(
            (answer) => {
              effectScheduler.clearAll();
              return answer;
            },
            (error) => {
              effectScheduler.clearAll();
              throw error;
            }
          )
          .finally(() => {
            cleanups.forEach((cleanup) => cleanup());
            screen.done({ clearContent: Boolean(context.clearPromptOnDone) });
            output.end();
          })
          .then(() => promise),
        { cancel }
      );
    });
  };
}
