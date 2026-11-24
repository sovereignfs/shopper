'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Icon,
  Input,
  SegmentedControl,
  Select,
} from '@sovereignfs/ui';
import { isGroceryIcon } from '../catalog/icons';
import type { InventoryEntry } from '../catalog/inventory';
import {
  type InventoryFilters,
  type KindFilter,
  NO_FILTERS,
  type SourceFilter,
  categoryOfEntry,
  sectionsOf,
} from '../inventory/screen';
import { inventoryScreenOf } from '../local/inventory-view';
import { useLocal, useLocalQuery } from '../local/react';
import { Beside } from './Beside';
import { InventoryPanel, NewEntryPanel } from './InventoryPanel';
import { useQueryParam } from './ItemEditor';
import { useTitle } from './title';
import styles from './InventoryScreen.module.css';

const NEW = 'new';

/**
 * **Inventory** (RFC 0006, DESIGN.md §16.8), the person's own: every item, theirs and the starter's together, searchable, grouped by category in the aisle order, and filtered by
 * category, by recurring or once and by mine, starter or hidden. An item opens beside the list (`?entry=<key>`, as an item of a list does, §16.7); _+ Add item_ opens a new one
 * (`?entry=new`). Everything is read from the device (`inventoryScreenOf`) and written to it, so it all works with no network. What it shows and how it groups is `sectionsOf`, pure.
 */
export function InventoryScreen() {
  useTitle(['Inventory']);
  const data = useLocalQuery((db) => inventoryScreenOf(db), []).data;
  const entryParam = useQueryParam('entry');
  const [filters, setFilters] = useState<InventoryFilters>(NO_FILTERS);

  const sections = useMemo(
    () => (data ? sectionsOf(data.entries, data.categories, filters) : []),
    [data, filters],
  );
  const open =
    entryParam.value === null || entryParam.value === NEW || !data
      ? undefined
      : data.entries.find((each) => each.key === entryParam.value);
  // An address that names an entry that is not there (a bad link, or a starter entry a later release dropped) closes itself. **It is asked of the device again before it
  // does:** an item that has just been made is in the device when its address is set, and the screen's own copy of what the device holds is read a moment later.
  const { value, close } = entryParam;
  const { client } = useLocal();
  const unknown =
    data !== undefined &&
    value !== null &&
    value !== NEW &&
    !data.entries.some((each) => each.key === value);
  useEffect(() => {
    if (!unknown || !client) return;
    let current = true;
    void client.read(inventoryScreenOf).then((fresh) => {
      if (current && !fresh?.entries.some((each) => each.key === value)) close();
    });
    return () => {
      current = false;
    };
  }, [unknown, client, value, close]);

  if (data === undefined) return <div className={styles.page} aria-busy="true" />;

  const panel =
    value === NEW
      ? (mobile: boolean) => (
          <NewEntryPanel
            key="new"
            data={data}
            mobile={mobile}
            onClose={close}
            onOpen={entryParam.replace}
          />
        )
      : open
        ? (mobile: boolean) => (
            <InventoryPanel
              key={open.key}
              data={data}
              entry={open}
              mobile={mobile}
              onClose={close}
            />
          )
        : null;

  const count = sections.reduce((total, section) => total + section.entries.length, 0);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const categories = data.categories.filter((each) => each.deletedAt === null && !each.hidden);

  return (
    <Beside panel={panel}>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>Inventory</h1>
          <Button size="sm" onClick={() => entryParam.open(NEW)}>
            <Icon name="plus" size="sm" aria-hidden />
            <span className={styles.label}>Add item</span>
          </Button>
        </header>
        <p className={styles.lede}>
          What you buy, in your words. A list offers it when you add, and a new name you add to a
          list is kept here.
        </p>

        <div className={styles.filters} role="search">
          <FormField label="Search Inventory">
            {(field) => (
              <Input
                {...field}
                type="search"
                value={filters.query}
                placeholder="Search"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="Category">
            {(field) => (
              <Select
                {...field}
                value={filters.category}
                onChange={(event) => setFilters({ ...filters, category: event.target.value })}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <SegmentedControl<KindFilter>
            aria-label="Recurring or once"
            size="sm"
            value={filters.kind}
            onChange={(kind) => setFilters({ ...filters, kind })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'recurring', label: 'Recurring' },
              { value: 'once', label: 'Once' },
            ]}
          />
          <SegmentedControl<SourceFilter>
            aria-label="Whose"
            size="sm"
            value={filters.source}
            onChange={(source) => setFilters({ ...filters, source })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Mine' },
              { value: 'starter', label: 'Starter' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
        </div>

        <p className={styles.count} role="status">
          {count === 1 ? '1 item' : `${count} items`}
        </p>

        {count === 0 ? (
          <EmptyState
            icon="package"
            heading="Nothing matches"
            description={filtered ? 'Change the search or the filters.' : 'Add an item to begin.'}
            {...(filtered
              ? {
                  action: (
                    <Button variant="secondary" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                      Clear filters
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          sections.map((section) => {
            const id = `inventory-${section.category.id}`;
            return (
              <section key={section.category.id} className={styles.section} aria-labelledby={id}>
                <h2 id={id} className={styles.heading}>
                  {section.category.name}
                </h2>
                <ul className={styles.entries}>
                  {section.entries.map((entry) => (
                    <li key={entry.key}>
                      <EntryRow
                        entry={entry}
                        selected={value === entry.key}
                        categoryIcon={categoryOfEntry(entry, data.categories)?.icon ?? null}
                        onOpen={() => entryParam.open(entry.key)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </Beside>
  );
}

/** An entry in the list: its icon, its name, and what is true of it (recurring, hidden, changed from the starter's). The whole row opens it. */
function EntryRow({
  entry,
  selected,
  categoryIcon,
  onOpen,
}: {
  entry: InventoryEntry;
  selected: boolean;
  categoryIcon: string | null;
  onOpen: () => void;
}) {
  const icon =
    entry.icon && isGroceryIcon(entry.icon)
      ? entry.icon
      : categoryIcon && isGroceryIcon(categoryIcon)
        ? categoryIcon
        : 'shopping-basket';
  return (
    <button
      type="button"
      className={styles.entry}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
    >
      <Icon name={icon} size="md" aria-hidden />
      <span className={styles.name}>{entry.name}</span>
      <span className={styles.tags}>
        {entry.recurring ? (
          <Badge size="xs" uppercase={false}>
            Recurring
          </Badge>
        ) : null}
        {entry.hidden ? (
          <Badge size="xs" uppercase={false}>
            Hidden
          </Badge>
        ) : null}
        {entry.mine ? (
          <Badge size="xs" uppercase={false}>
            Mine
          </Badge>
        ) : null}
      </span>
      <Icon name="chevron-right" size="sm" aria-hidden />
    </button>
  );
}
