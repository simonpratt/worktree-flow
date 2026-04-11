import chalk from 'chalk';
import {
  ValidationError,
  createPrompt,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
  type Status,
} from '@inquirer/core';
import type { RepoCheckboxChoice } from './helpers.js';

export type RepoPickerSeparator = {
  separator?: string;
};

export type RepoPickerChoice = RepoCheckboxChoice & {
  description?: string;
  disabled?: boolean | string;
  short?: string;
};

export type RepoPickerItem = RepoPickerChoice | RepoPickerSeparator;

export type NormalizedRepoPickerChoice = {
  type: 'choice';
  value: string;
  name: string;
  checked: boolean;
  short: string;
  description?: string;
  disabled: boolean | string;
};

export type NormalizedRepoPickerSeparator = {
  type: 'separator';
  separator: string;
};

type NormalizedRepoPickerItem = NormalizedRepoPickerChoice | NormalizedRepoPickerSeparator;

type RepoPickerEmptyState = {
  type: 'empty';
  message: string;
};

type RepoPickerRenderItem = NormalizedRepoPickerItem | RepoPickerEmptyState;

type SearchableRepoPickerConfig = {
  message: string;
  choices: ReadonlyArray<RepoPickerItem>;
  pageSize?: number;
  loop?: boolean;
};

const HIDE_CURSOR = '\x1B[?25l';

type RepoPickerKeypress = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

function isRepoPickerChoice(item: NormalizedRepoPickerItem | RepoPickerRenderItem): item is NormalizedRepoPickerChoice {
  return item.type === 'choice';
}

function isRepoPickerSeparator(item: RepoPickerItem): item is RepoPickerSeparator {
  return typeof item === 'object' && item !== null && 'separator' in item && !('value' in item);
}

function isRepoPickerEmptyState(item: RepoPickerRenderItem): item is RepoPickerEmptyState {
  return item.type === 'empty';
}

export function normalizeRepoPickerChoices(
  choices: ReadonlyArray<RepoPickerItem>
): NormalizedRepoPickerItem[] {
  return choices.map((choice) => {
    if (isRepoPickerSeparator(choice)) {
      return {
        type: 'separator',
        separator: choice.separator ?? '',
      };
    }

    return {
      type: 'choice',
      value: choice.value,
      name: choice.name,
      checked: choice.checked,
      short: choice.short ?? choice.name,
      description: choice.description,
      disabled: choice.disabled ?? false,
    };
  });
}

export function filterRepoPickerChoices(
  items: ReadonlyArray<NormalizedRepoPickerItem>,
  query: string
): NormalizedRepoPickerChoice[] {
  const trimmedQuery = query.trim().toLowerCase();
  return items.filter((item): item is NormalizedRepoPickerChoice => {
    if (!isRepoPickerChoice(item)) {
      return false;
    }

    if (trimmedQuery.length === 0) {
      return true;
    }

    return item.name.toLowerCase().includes(trimmedQuery);
  });
}

export function getSelectedRepoPickerValues(
  items: ReadonlyArray<NormalizedRepoPickerItem>
): string[] {
  return items
    .filter((item): item is NormalizedRepoPickerChoice => isRepoPickerChoice(item) && item.checked)
    .map((item) => item.value);
}

export function getFirstSelectableRepoValue(
  items: ReadonlyArray<NormalizedRepoPickerItem>
): string | undefined {
  return items.find(isRepoPickerChoice)?.value;
}

export function getNextSelectableRepoValue(
  items: ReadonlyArray<NormalizedRepoPickerItem>,
  currentValue: string | undefined,
  direction: -1 | 1,
  loop: boolean
): string | undefined {
  const choices = items.filter(isRepoPickerChoice);

  if (choices.length === 0) {
    return undefined;
  }

  const currentIndex = choices.findIndex((choice) => choice.value === currentValue);
  const startIndex = currentIndex === -1 ? 0 : currentIndex;
  let nextIndex = startIndex + direction;

  if (loop) {
    nextIndex = (nextIndex + choices.length) % choices.length;
  } else {
    nextIndex = Math.max(0, Math.min(choices.length - 1, nextIndex));
  }

  return choices[nextIndex]?.value;
}

export function toggleRepoPickerChoice(
  items: ReadonlyArray<NormalizedRepoPickerItem>,
  value: string | undefined
): NormalizedRepoPickerItem[] {
  if (!value) {
    return [...items];
  }

  return items.map((item) => {
    if (!isRepoPickerChoice(item) || item.value !== value || item.disabled) {
      return item;
    }

    return {
      ...item,
      checked: !item.checked,
    };
  });
}

export function getTypedCharacter(key: RepoPickerKeypress): string | undefined {
  if (typeof key.sequence !== 'string' || key.sequence.length !== 1 || key.ctrl || key.meta) {
    return undefined;
  }

  return key.sequence;
}

function getSelectionSummary(items: ReadonlyArray<NormalizedRepoPickerItem>): string {
  const selectedChoices = items.filter(
    (item): item is NormalizedRepoPickerChoice => isRepoPickerChoice(item) && item.checked
  );

  if (selectedChoices.length === 0) {
    return chalk.dim('none');
  }

  return chalk.cyan(selectedChoices.map((item) => item.short).join(', '));
}

function getNoMatchesMessage(query: string): string {
  return `No matching repos for "${query}".`;
}

export const searchableRepoCheckbox = createPrompt<string[], SearchableRepoPickerConfig>((config, done) => {
  const { loop = true, pageSize = 7 } = config;
  const initialItems = normalizeRepoPickerChoices(config.choices);

  if (initialItems.every((item) => !isRepoPickerChoice(item))) {
    throw new ValidationError('[repo picker] No selectable choices.');
  }

  const [status, setStatus] = useState<Status>('idle');
  const [items, setItems] = useState<ReadonlyArray<NormalizedRepoPickerItem>>(initialItems);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState<string | undefined>(
    getFirstSelectableRepoValue(initialItems)
  );
  const prefix = usePrefix({ status });

  const visibleItems = searchMode ? filterRepoPickerChoices(items, query) : items;
  const visibleChoices = visibleItems.filter(isRepoPickerChoice);
  const resolvedActiveValue = visibleChoices.some((choice) => choice.value === activeValue)
    ? activeValue
    : visibleChoices[0]?.value;

  const renderItems: ReadonlyArray<RepoPickerRenderItem> =
    searchMode && visibleChoices.length === 0
      ? [{ type: 'empty', message: getNoMatchesMessage(query) }]
      : visibleItems;

  const activeRenderIndex = renderItems.findIndex(
    (item) => isRepoPickerChoice(item) && item.value === resolvedActiveValue
  );

  useKeypress((key, readline) => {
    const typedKey = key as typeof key & RepoPickerKeypress;
    const typedCharacter = getTypedCharacter(typedKey);

    readline.clearLine(0);

    if (isEnterKey(key)) {
      if (searchMode) {
        setSearchMode(false);
        setQuery('');
        return;
      }

      setStatus('done');
      done(getSelectedRepoPickerValues(items));
      return;
    }

    if (isUpKey(key) || isDownKey(key)) {
      const direction = isUpKey(key) ? -1 : 1;
      const nextValue = getNextSelectableRepoValue(
        visibleItems,
        resolvedActiveValue,
        direction,
        loop
      );

      if (nextValue) {
        setActiveValue(nextValue);
      }
      return;
    }

    if (isSpaceKey(key)) {
      setItems(toggleRepoPickerChoice(items, resolvedActiveValue));
      return;
    }

    if (!searchMode && typedCharacter === '/') {
      setSearchMode(true);
      setQuery('');
      return;
    }

    if (!searchMode) {
      return;
    }

    if (isBackspaceKey(key)) {
      setQuery(query.slice(0, -1));
      return;
    }

    if (typedCharacter) {
      setQuery(query + typedCharacter);
    }
  });

  if (status === 'done') {
    return `${prefix} ${chalk.bold(config.message)} ${getSelectionSummary(items)}`;
  }

  let description: string | undefined;
  const page = usePagination({
    items: renderItems,
    active: activeRenderIndex === -1 ? 0 : activeRenderIndex,
    renderItem({ item, isActive }) {
      if (isRepoPickerEmptyState(item)) {
        return chalk.yellow(`  ${item.message}`);
      }

      if (item.type === 'separator') {
        return ` ${chalk.dim(item.separator)}`;
      }

      if (isActive) {
        description = item.description;
      }

      const cursor = isActive ? '>' : ' ';
      const checkbox = item.checked ? '[x]' : '[ ]';
      const label = item.checked ? chalk.cyan(item.name) : item.name;
      const activeLabel = isActive ? chalk.bold(label) : label;
      return `${cursor}${checkbox} ${activeLabel}`;
    },
    pageSize,
    loop,
  });

  const prompt = searchMode
    ? `${prefix} ${chalk.bold(config.message)} ${chalk.dim('[search]')} ${chalk.cyan('/')}${query}`
    : `${prefix} ${chalk.bold(config.message)}`;

  const help = searchMode
    ? chalk.dim('up/down navigate | space select | type filter | enter clear search')
    : chalk.dim('up/down navigate | space select | / search | enter continue');

  const lines = [
    prompt,
    page,
    ' ',
    description ? chalk.cyan(description) : '',
    help,
  ]
    .filter(Boolean)
    .join('\n')
    .trimEnd();

  return `${lines}${HIDE_CURSOR}`;
});
