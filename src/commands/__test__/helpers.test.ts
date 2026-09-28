import { describe, it, expect } from 'vitest';
import sinon from 'sinon';
import { buildRepoOptions, handleCommandError, resolveReposByName } from '../helpers.js';
import { PromptCancelledError, RepoNotFoundError } from '../../lib/errors.js';

function makeServices(repoChoices: Array<{ name: string; value: string }>) {
  return {
    repos: {
      formatRepoChoices: sinon.stub().returns(repoChoices),
    },
  };
}

describe('buildRepoOptions', () => {
  it('labels each repo by name, keeping the sorted order from formatRepoChoices', () => {
    const services = makeServices([
      { name: 'repo1', value: '/source/repo1' },
      { name: 'repo2', value: '/source/repo2' },
    ]);

    const { options } = buildRepoOptions(['/source/repo2', '/source/repo1'], services as any, []);

    expect(options).toEqual([
      { value: '/source/repo1', label: 'repo1' },
      { value: '/source/repo2', label: 'repo2' },
    ]);
  });

  it('pre-selects the paths of repos listed in branchAutoSelectRepos', () => {
    const services = makeServices([
      { name: 'repo1', value: '/source/repo1' },
      { name: 'repo2', value: '/source/repo2' },
    ]);

    const { initialValues } = buildRepoOptions(
      ['/source/repo1', '/source/repo2'],
      services as any,
      ['repo2', 'not-a-repo']
    );

    expect(initialValues).toEqual(['/source/repo2']);
  });
});

describe('handleCommandError', () => {
  function makeCommandServices() {
    return {
      console: { error: sinon.stub() },
      process: { exit: sinon.stub() },
    };
  }

  it('exits quietly when a prompt was cancelled', () => {
    const services = makeCommandServices();

    handleCommandError(new PromptCancelledError(), services as any);

    sinon.assert.notCalled(services.console.error);
    sinon.assert.notCalled(services.process.exit);
  });

  it('prints the message and exits non-zero for other errors', () => {
    const services = makeCommandServices();

    handleCommandError(new Error('boom'), services as any);

    sinon.assert.calledWith(services.console.error, 'boom');
    sinon.assert.calledWith(services.process.exit, 1);
  });
});

describe('resolveReposByName', () => {
  const candidates = ['/source/repo1', '/source/repo2', '/source/repo3'];

  it('resolves matching repo names to their full paths, preserving requested order', () => {
    const result = resolveReposByName(candidates, ['repo3', 'repo1']);

    expect(result).toEqual(['/source/repo3', '/source/repo1']);
  });

  it('throws RepoNotFoundError listing available repos when a name does not match', () => {
    expect(() => resolveReposByName(candidates, ['repo1', 'nope'])).toThrow(RepoNotFoundError);
    expect(() => resolveReposByName(candidates, ['nope'])).toThrow(/repo1, repo2, repo3/);
  });
});
