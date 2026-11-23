'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ColorPicker,
  ConfirmDialog,
  FormField,
  IconPicker,
  Input,
  SettingsDialog,
} from '@sovereignfs/ui';
import { archiveList, renameList, restoreList, styleList } from '../actions/lists';
import type { ListRow } from '../actions/rows';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import type { ListData } from '../local/listview';
import { LIST_ICONS, LIST_SWATCHES, listColorOf, listIconOf } from '../lists/appearance';
import { callOperation } from '../local/ops';
import { useLocal } from '../local/react';
import styles from './ListSettingsDialog.module.css';

type Found = Extract<ListData, { found: true }>;

/** The sections, in the order the dialog lists them; an address names one by its id (`?settings=general`). */
export const LIST_SETTINGS_SECTIONS = ['general', 'archive'] as const;
export type ListSettingsSection = (typeof LIST_SETTINGS_SECTIONS)[number];

/** The section an address names, or `null` for none (the sections alone on a phone, the first on a wider screen): a value that is not a section is none. */
export const sectionOfAddress = (value: string): ListSettingsSection | null =>
  (LIST_SETTINGS_SECTIONS as readonly string[]).includes(value)
    ? (value as ListSettingsSection)
    : null;

const env = () => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/**
 * **A list's settings** (RFC 0005, DESIGN.md §9.1, §16.5): the design system's settings dialog over the list, at `?settings=<section>`, so that Back closes it
 * and a link opens it, offline too. Two sections, each its own group: **General** (its name, icon and colour) and **Archive and delete**. Renaming, styling,
 * archiving and restoring are synced changes, so they work with no network; deleting for good is **an Admin's online operation, offered only for an archived
 * list** (it removes the list and its items), and says why when the server will not. The clearing rule and moving to another household come with trips (7.2)
 * and households (3.6).
 */
export function ListSettingsDialog({
  data,
  section,
  onSection,
  onClose,
}: {
  data: Found;
  /** The section the address names, or `null`. */
  section: ListSettingsSection | null;
  onSection: (section: ListSettingsSection | null) => void;
  onClose: () => void;
}) {
  return (
    <SettingsDialog
      open
      onClose={onClose}
      title="List settings"
      size="fixed"
      active={section}
      onSelect={(id) => onSection(id === null ? null : sectionOfAddress(id))}
      backLabel="Back to the sections"
      groups={[
        {
          id: 'list',
          sections: [
            {
              id: 'general',
              label: 'General',
              icon: 'settings',
              content: <General list={data.list} />,
            },
          ],
        },
        {
          id: 'keep',
          sections: [
            {
              id: 'archive',
              label: 'Archive and delete',
              icon: 'archive',
              content: <ArchiveAndDelete data={data} />,
            },
          ],
        },
      ]}
    />
  );
}

/** Its name, with a button, and its icon and colour, which are written as they are chosen. */
function General({ list }: { list: ListRow }) {
  const { client } = useLocal();
  const [name, setName] = useState<string | null>(null);
  const shown = name ?? list.name;
  const trimmed = shown.trim();

  // A colour is chosen by dragging, which says every colour on the way: it is shown at once and written once it has been still for a moment (and when the
  // section is left), so that one pick is one change and not a hundred.
  const [color, setColor] = useState<string | null | undefined>(undefined);
  const latest = useRef<{ list: ListRow; color: string | null | undefined }>({
    list,
    color: undefined,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  latest.current.list = list;
  const flushColor = useCallback(() => {
    clearTimeout(timer.current);
    const { list: current, color: value } = latest.current;
    latest.current.color = undefined;
    if (value === undefined || !client) return;
    const mutation = styleList(env(), current, { color: value });
    if (mutation) void client.commit(mutation);
    setColor(undefined);
  }, [client]);
  useEffect(() => flushColor, [flushColor]);
  const chooseColor = (value: string | null) => {
    setColor(value);
    latest.current.color = value;
    clearTimeout(timer.current);
    timer.current = setTimeout(flushColor, 400);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!client || !isName(trimmed) || trimmed === list.name) return;
    await client.commit(renameList(env(), list, trimmed));
    setName(null);
  }

  return (
    <div className={styles.section}>
      <form className={styles.group} onSubmit={(event) => void save(event)} aria-label="Name">
        <FormField label="Name">
          {(field) => (
            <Input
              {...field}
              value={shown}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <div className={styles.row}>
          <Button type="submit" disabled={!isName(trimmed) || trimmed === list.name}>
            Save name
          </Button>
        </div>
      </form>

      <section className={styles.group} aria-label="Appearance">
        <h3>Appearance</h3>
        <p className={styles.muted}>
          The icon and colour that stand for this list in its header, the sidebar and the drawer.
        </p>
        <div className={styles.between}>
          <span>Icon</span>
          <IconPicker
            aria-label="Icon"
            value={listIconOf(list.icon)}
            options={LIST_ICONS}
            onChange={(icon) => {
              const mutation = styleList(env(), list, { icon });
              if (mutation) void client?.commit(mutation);
            }}
          />
        </div>
        <span>Colour</span>
        <ColorPicker
          aria-label="Colour"
          customLabel="Choose another colour"
          allowNone
          noneLabel="Default colour"
          swatches={LIST_SWATCHES}
          value={color === undefined ? (list.color ? listColorOf(list.color) : null) : color}
          onChange={chooseColor}
        />
      </section>
    </div>
  );
}

/** Archive or restore, and, for an archived list and its Admin alone, delete for good after a confirmation. */
function ArchiveAndDelete({ data }: { data: Found }) {
  const { client } = useLocal();
  const router = useRouter();
  const { list, household } = data;
  const archived = list.archivedAt !== null;
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function remove() {
    if (!client) return;
    setWorking(true);
    setProblem(null);
    const result = await callOperation({
      op: 'list.delete',
      household: household.id,
      list: list.id,
    });
    setWorking(false);
    if (!result.ok) {
      setConfirming(false);
      return setProblem(result.message);
    }
    // The list and its items are gone from the server; this device learns it at its next sync, so it is asked for now, so that the front address does not open it.
    await client.sync();
    router.push('/');
  }

  return (
    <div className={styles.section}>
      <section className={styles.group} aria-label="Archive">
        <h3>{archived ? 'Archived' : 'Archive'}</h3>
        <p className={styles.muted}>
          {archived
            ? 'This list is archived: it is out of the way in the sidebar and keeps its items. Restore it to use it again.'
            : 'Puts the list out of the way, with its items, and it can be restored. Adding an item to it restores it too.'}
        </p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            onClick={() =>
              void client?.commit(archived ? restoreList(env(), list) : archiveList(env(), list))
            }
          >
            {archived ? 'Restore this list' : 'Archive this list'}
          </Button>
        </div>
      </section>

      {archived && household.role === 'admin' ? (
        <section className={styles.group} aria-label="Delete">
          <h3>Delete</h3>
          <p className={styles.muted}>
            Deletes the list and everything on it, for everyone it is shared with. It cannot be
            undone, and it needs a connection.
          </p>
          {problem ? <Alert variant="error">{problem}</Alert> : null}
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Delete this list…
            </Button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this list for good?"
        message={
          <>
            <strong>{list.name}</strong> and every item on it will be deleted for everyone. This
            cannot be undone.
          </>
        }
        confirmLabel={working ? 'Deleting…' : 'Delete for good'}
        destructive
        pending={working}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
