'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Icon, type IconName, SuggestionInput } from '@sovereignfs/ui';
import type { Mutation } from '../actions/format';
import { isGroceryIcon } from '../catalog/icons';
import { type Suggestion, suggest } from '../catalog/suggest';
import type { ListData } from '../local/listview';
import { suggestionMeta } from '../lists/adding';
import styles from './ListScreen.module.css';
import { useAdder, useInventoryEntries } from './useAdder';

type Found = Extract<ListData, { found: true }>;

/**
 * **The add field** (DESIGN.md §16.6): at the top of a list, always. Typing suggests (§8.5, `suggest`, on the device, offline) from the person's Inventory first, then the
 * list's products, each with its icon, name, quantity and unit, and "On the list · 2" for what is already open, which choosing bumps rather than doubles (§9.3). **Enter takes the first,** the
 * arrows move, a tap adds, and "Add _text_" is always last, so nobody is stuck. The field **stays focused and empty** after an add, so that a list is
 * typed as fast as it is thought. Nothing here is asynchronous: the device answers at once.
 */
export function AddField({
  data,
  change,
  basket = false,
  focused = false,
  onAdded,
  onEscape,
}: {
  data: Found;
  /** Adds straight into the basket (shopping mode's "Put it straight in the basket"): the item is ticked by the person as it is added. */
  basket?: boolean;
  /** Takes focus when it is drawn: shopping mode opens it from a button, and it is what the person went there to use. */
  focused?: boolean;
  /** Told when an item has been added (shopping mode closes the field). */
  onAdded?: () => void;
  /** Told when Escape is pressed in the field (shopping mode closes it). */
  onEscape?: () => void;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
}) {
  const { list, products, items } = data;
  const [text, setText] = useState('');
  const [fresh, setFresh] = useState(0);
  const inventory = useInventoryEntries();
  const {
    add: addSuggestion,
    refused,
    clearRefused,
  } = useAdder({
    data,
    change,
    basket,
    ...(onAdded ? { onAdded } : {}),
  });
  const id = useId();
  useEffect(() => {
    if (fresh === 0 && !focused) return;
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) input.focus();
  }, [fresh, focused, id]);
  const suggestions = useMemo(
    () =>
      text.trim() === ''
        ? []
        : suggest({
            text,
            products,
            items,
            listId: list.id,
            ...(inventory ? { inventory } : {}),
          }).filter(notNew),
    [text, products, items, list.id, inventory],
  );

  function add(suggestion: Suggestion) {
    // The design system's field closes its suggestions after a choice and opens them only when it gains focus, so a new one takes the place of the old,
    // and the effect above gives it focus before the next key: the second item of a list can be typed at once.
    setText('');
    setFresh((count) => count + 1);
    addSuggestion(suggestion);
  }

  return (
    // Escape is a shortcut for the button that opened the field, which is the control; the field itself keeps every key it had.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.add}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onEscape) onEscape();
      }}
    >
      <SuggestionInput
        key={fresh}
        id={id}
        aria-label="Add an item"
        placeholder="Add an item"
        value={text}
        onChange={(value) => {
          setText(value);
          clearRefused();
        }}
        options={suggestions.map((suggestion, index) => {
          const meta = suggestionMeta(suggestion);
          return {
            id: `${index}`,
            label: suggestion.name,
            icon: <Icon name={iconOf(suggestion)} aria-hidden />,
            ...(meta ? { meta } : {}),
          };
        })}
        onSelect={(option) => {
          const chosen = suggestions[Number(option.id)];
          if (chosen) add(chosen);
        }}
        createLabel={(value) => `Add “${value.trim()}”`}
        onCreate={(value) =>
          add({ kind: 'new', name: value.trim(), icon: null, quantity: null, unit: null })
        }
      />
      {refused ? (
        <p className={styles.note} role="status">
          {refused}
        </p>
      ) : null}
    </div>
  );
}

const notNew = (suggestion: Suggestion): boolean => suggestion.kind !== 'new';

function iconOf(suggestion: Suggestion): IconName {
  return suggestion.icon && isGroceryIcon(suggestion.icon) ? suggestion.icon : 'shopping-basket';
}
