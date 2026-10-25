import { describe, it, expect } from 'vitest';
import sinon from 'sinon';
import { complete, formatCandidate, ZSH_COMPLETION, type CompletionSources } from '../completion.js';

describe('complete', () => {
  function sources(): CompletionSources & { workspaces: sinon.SinonStub } {
    return {
      commands: () => [
        { name: 'create', description: 'Create a workspace', group: 'Workspaces' },
        { name: 'switch', description: 'Switch to a workspace', group: 'Workspaces' },
        { name: 'tmux', description: 'Deprecated: use "flow sessions" instead', group: 'Deprecated' },
        { name: 'help', description: 'display help for command' },
      ],
      workspaces: sinon.stub().returns([
        { name: 'feature_ABC-123', repoCount: 2 },
        { name: 'solo', repoCount: 1 },
      ]),
    };
  }

  it('offers the commands, without deprecated ones, when nothing is typed yet', () => {
    const s = sources();

    expect(complete([], s)).toEqual([
      { value: 'create', description: 'Create a workspace' },
      { value: 'switch', description: 'Switch to a workspace' },
      { value: 'help', description: 'display help for command' },
    ]);
    sinon.assert.notCalled(s.workspaces);
  });

  it('offers workspace names with their repo counts after switch', () => {
    expect(complete(['switch'], sources())).toEqual([
      { value: 'feature_ABC-123', description: '2 repos' },
      { value: 'solo', description: '1 repo' },
    ]);
  });

  it('offers nothing once switch has its workspace', () => {
    expect(complete(['switch', 'solo'], sources())).toEqual([]);
  });

  it('offers nothing after other commands', () => {
    const s = sources();

    expect(complete(['create'], s)).toEqual([]);
    expect(complete(['config', 'set'], s)).toEqual([]);
    sinon.assert.notCalled(s.workspaces);
  });
});

describe('formatCandidate', () => {
  it('separates the value and description with a colon', () => {
    expect(formatCandidate({ value: 'solo', description: '1 repo' })).toBe('solo:1 repo');
  });

  it('escapes colons in the value, so zsh does not split it there', () => {
    expect(formatCandidate({ value: 'ab:cd', description: 'x: y' })).toBe('ab\\:cd:x: y');
  });

  it('keeps each candidate on one line', () => {
    expect(formatCandidate({ value: 'a', description: 'line one\nline two' })).toBe('a:line one line two');
  });
});

describe('ZSH_COMPLETION', () => {
  it('is a completion file for flow that asks flow for the candidates', () => {
    expect(ZSH_COMPLETION.startsWith('#compdef flow\n')).toBe(true);
    expect(ZSH_COMPLETION).toContain('flow __complete -- "${(@)words[2,CURRENT-1]}"');
    expect(ZSH_COMPLETION).toContain("_describe 'flow' items");
  });
});
