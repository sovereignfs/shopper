'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, FormField, Input } from '@sovereignfs/ui';
import { archiveList, renameList, restoreList } from '../actions/lists';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import { listViewOf } from '../local/listview';
import { callOperation } from '../local/ops';
import { useLocal, useLocalQuery } from '../local/react';
import styles from './ListSettings.module.css';

/**
 * A list's settings (DESIGN.md §9.1, §16.3): its **name**, **archive** (and restore), and **delete for good**. Renaming, archiving and restoring are synced
 * changes, so they work with no network; deleting for good is **an Admin's online operation, offered only for an archived list** (it removes the list and
 * its items), and says why when the server will not. The clearing rule and moving to another household come with trips (7.2) and households (3.6).
 */
const env = () => ({ now: Date.now(), newId: () => crypto.randomUUID() });

export function ListSettings({ id }: { id: string }) {
  const { client } = useLocal();
  const router = useRouter();
  const found = useLocalQuery((db) => listViewOf(db, id), [id]).data;
  const [name, setName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  if (!found) return <div className={styles.page} aria-busy="true" />;
  if (!found.found)
    return found.synced ? (
      <EmptyState
        icon="list-todo"
        heading="That list is not here"
        description="It may have been deleted, or it is not one of yours."
        action={<Link href="/">Back to your lists</Link>}
      />
    ) : (
      <div className={styles.page} aria-busy="true" />
    );
  const { list, household } = found;
  const archived = list.archivedAt !== null;
  const shown = name ?? list.name;
  const trimmed = shown.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!client || !isName(trimmed) || trimmed === list.name) return;
    await client.commit(renameList(env(), list, trimmed));
    setName(null);
  }

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
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/l/${list.id}`} className={styles.back}>
          ← {list.name}
        </Link>
        <h1>List settings</h1>
      </header>

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

      <section className={styles.group} aria-label="Archive">
        <h2>{archived ? 'Archived' : 'Archive'}</h2>
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
          <h2>Delete</h2>
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
