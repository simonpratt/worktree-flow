import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { buildRepoCheckboxChoices } from '../helpers.js';
import type { ParsedConfig } from '../../lib/config.js';

const defaultConfig: ParsedConfig = {
  sourcePath: '/source',
  destPath: '/dest',
  copyFiles: '.env',
  tmux: false,
  postCheckout: undefined,
  perRepoPostCheckout: {},
  fetchCacheTtlSeconds: 300,
  branchAutoSelectRepos: [],
};

function makeSeparator(label?: string) {
  return { isSeparator: true, label };
}

function makeServices(repoChoices: Array<{ name: string; value: string }>, recentlyUsed: string[]) {
  return {
    repos: {
      formatRepoChoices: sinon.stub().returns(repoChoices),
    },
    fetchCache: {
      getRecentlyUsedRepos: sinon.stub().returns(recentlyUsed),
    },
  };
}

describe('buildRepoCheckboxChoices', () => {
  it('returns flat choices when no recently used repos', () => {
    const services = makeServices(
      [
        { name: 'repo1', value: '/source/repo1' },
        { name: 'repo2', value: '/source/repo2' },
      ],
      []
    );

    const result = buildRepoCheckboxChoices(
      ['/source/repo1', '/source/repo2'],
      services as any,
      defaultConfig,
      makeSeparator
    );

    expect(result).toEqual([
      { name: 'repo1', value: '/source/repo1', checked: false },
      { name: 'repo2', value: '/source/repo2', checked: false },
    ]);
  });

  it('groups recently used repos under a separator when present', () => {
    const services = makeServices(
      [
        { name: 'repo1', value: '/source/repo1' },
        { name: 'repo2', value: '/source/repo2' },
        { name: 'repo3', value: '/source/repo3' },
      ],
      ['repo1', 'repo3']
    );

    const result = buildRepoCheckboxChoices(
      ['/source/repo1', '/source/repo2', '/source/repo3'],
      services as any,
      defaultConfig,
      makeSeparator
    ) as any[];

    expect(result[0]).toEqual(makeSeparator('Recently Used'));
    expect(result[1]).toMatchObject({ name: 'repo1' });
    expect(result[2]).toMatchObject({ name: 'repo3' });
    // divider before remaining
    expect(result[3]).toEqual(makeSeparator(undefined));
    expect(result[4]).toMatchObject({ name: 'repo2' });
  });

  it('omits the trailing separator when all repos are recently used', () => {
    const services = makeServices(
      [
        { name: 'repo1', value: '/source/repo1' },
        { name: 'repo2', value: '/source/repo2' },
      ],
      ['repo1', 'repo2']
    );

    const result = buildRepoCheckboxChoices(
      ['/source/repo1', '/source/repo2'],
      services as any,
      defaultConfig,
      makeSeparator
    ) as any[];

    // Only the "Recently Used" separator + 2 repo choices — no trailing separator
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(makeSeparator('Recently Used'));
    expect(result[1]).toMatchObject({ name: 'repo1' });
    expect(result[2]).toMatchObject({ name: 'repo2' });
  });

  it('pre-checks repos listed in branchAutoSelectRepos', () => {
    const services = makeServices(
      [
        { name: 'repo1', value: '/source/repo1' },
        { name: 'repo2', value: '/source/repo2' },
      ],
      []
    );

    const config = { ...defaultConfig, branchAutoSelectRepos: ['repo1'] };

    const result = buildRepoCheckboxChoices(
      ['/source/repo1', '/source/repo2'],
      services as any,
      config,
      makeSeparator
    ) as any[];

    expect(result.find((c) => c.name === 'repo1').checked).toBe(true);
    expect(result.find((c) => c.name === 'repo2').checked).toBe(false);
  });

  it('uses the provided createSeparator factory for all separators', () => {
    const separators: Array<string | undefined> = [];
    const trackingSeparator = (label?: string) => {
      separators.push(label);
      return makeSeparator(label);
    };

    const services = makeServices(
      [
        { name: 'repo1', value: '/source/repo1' },
        { name: 'repo2', value: '/source/repo2' },
      ],
      ['repo1']
    );

    buildRepoCheckboxChoices(
      ['/source/repo1', '/source/repo2'],
      services as any,
      defaultConfig,
      trackingSeparator
    );

    expect(separators).toEqual(['Recently Used', undefined]);
  });
});
