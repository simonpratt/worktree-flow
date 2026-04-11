import { describe, expect, it } from 'vitest';
import {
  filterRepoPickerChoices,
  getNextSelectableRepoValue,
  getSelectedRepoPickerValues,
  normalizeRepoPickerChoices,
  toggleRepoPickerChoice,
} from '../repoPicker.js';

describe('repoPicker', () => {
  it('filters repos case-insensitively by name and ignores separators', () => {
    const items = normalizeRepoPickerChoices([
      { separator: 'Recently Used' },
      { name: 'payments-api', value: '/source/payments-api', checked: false },
      { name: 'worker', value: '/source/worker', checked: false },
      { separator: '' },
      { name: 'API-gateway', value: '/source/api-gateway', checked: true },
    ]);

    const filtered = filterRepoPickerChoices(items, 'api');

    expect(filtered.map((item) => item.name)).toEqual(['payments-api', 'API-gateway']);
  });

  it('preserves checked repos when toggling while filtered and then clearing the search', () => {
    const items = normalizeRepoPickerChoices([
      { separator: 'Recently Used' },
      { name: 'repo-one', value: '/source/repo-one', checked: false },
      { name: 'repo-two', value: '/source/repo-two', checked: true },
      { separator: '' },
      { name: 'repo-three', value: '/source/repo-three', checked: false },
    ]);

    const filtered = filterRepoPickerChoices(items, 'repo-one');
    const toggled = toggleRepoPickerChoice(items, filtered[0]?.value);

    expect(getSelectedRepoPickerValues(toggled)).toEqual([
      '/source/repo-one',
      '/source/repo-two',
    ]);

    const restored = filterRepoPickerChoices(toggled, '');
    expect(restored.find((item) => item.name === 'repo-one')?.checked).toBe(true);
    expect(restored.find((item) => item.name === 'repo-two')?.checked).toBe(true);
    expect(restored.find((item) => item.name === 'repo-three')?.checked).toBe(false);
  });

  it('moves through selectable repos without landing on separators', () => {
    const items = normalizeRepoPickerChoices([
      { separator: 'Recently Used' },
      { name: 'repo-one', value: '/source/repo-one', checked: false },
      { separator: '' },
      { name: 'repo-two', value: '/source/repo-two', checked: false },
      { name: 'repo-three', value: '/source/repo-three', checked: false },
    ]);

    expect(getNextSelectableRepoValue(items, '/source/repo-one', 1, false)).toBe('/source/repo-two');
    expect(getNextSelectableRepoValue(items, '/source/repo-three', 1, false)).toBe('/source/repo-three');
    expect(getNextSelectableRepoValue(items, '/source/repo-one', -1, true)).toBe('/source/repo-three');
  });

  it('returns no matches when the search query misses every repo', () => {
    const items = normalizeRepoPickerChoices([
      { name: 'frontend', value: '/source/frontend', checked: false },
      { name: 'backend', value: '/source/backend', checked: false },
    ]);

    expect(filterRepoPickerChoices(items, 'mobile')).toEqual([]);
  });
});
