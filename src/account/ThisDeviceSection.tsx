'use client';

import { useRef, useState } from 'react';
import { Alert, Button, ConfirmDialog, Select } from '@sovereignfs/ui';
import { canMove } from '../local/describe';
import type { FailedEntry } from '../local/db';
import { useLocal, useLocalQuery } from '../local/react';
import { resetDevice } from '../local/reset';
import { failedOf, lastSyncedAt, listsOf, persistenceGranted } from '../local/store';
import type { ListRow } from '../local/rows';
import styles from './Account.module.css';

/**
 * Settings, This device (DESIGN.md §12.5, §17): **when it last synced**, whether the browser agreed to keep the working copy, **Couldn't sync**, and _Reset this
 * device_. It is read from the device's own store, in the browser, so it says the same offline: it is what a person looks at to know whether what they did
 * has reached the others. Nothing here needs a connection except sending what is waiting before a reset.
 */
type Entry = FailedEntry & { n: number };
interface Row {
  entry: Entry;
  /** The lists it could be moved to, in its household: none for a household that is gone or a change that put nothing on a list. */
  targets: ListRow[];
}

const when = (at: number) =>
  new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function ThisDeviceSection() {
  const { accountId, client } = useLocal();
  const device = useLocalQuery(async (db) => ({
    syncedAt: await lastSyncedAt(db),
    persisted: await persistenceGranted(db),
  }));
  const failed = useLocalQuery(async (db): Promise<Row[]> => {
    const rows: Row[] = [];
    for (const entry of await failedOf(db)) {
      const movable = canMove(entry.mutation);
      const lists = movable ? await listsOf(db, entry.mutation.householdId) : [];
      // Not the list it was refused on: it is gone, or full.
      const refusedOn = new Set(
        entry.mutation.changes.flatMap((change) =>
          typeof change.fields.listId === 'string' ? [change.fields.listId] : [],
        ),
      );
      rows.push({ entry, targets: lists.filter((list) => !refusedOn.has(list.id)) });
    }
    return rows;
  });

  const [discarding, setDiscarding] = useState<Entry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [resetting, setResetting] = useState<'idle' | 'working'>('idle');
  const [asking, setAsking] = useState<{ unsent: number; refused: number } | null>(null);
  const answer = useRef<((go: boolean) => void) | null>(null);

  async function reset() {
    if (!client) return;
    setResetting('working');
    const result = await resetDevice({
      accountId,
      client,
      confirmLosing: (unsent, refused) =>
        new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setAsking({ unsent, refused });
        }),
    });
    setAsking(null);
    if (result.status === 'reset') return window.location.reload();
    setResetting('idle');
  }

  const rows = failed.data ?? [];
  return (
    <>
      <div className={styles.group}>
        <h2>This device</h2>
        <p className={styles.muted}>
          {device.data?.syncedAt === undefined
            ? 'Not synced yet.'
            : `Last synced ${when(device.data.syncedAt)}.`}
        </p>
        <p className={styles.muted}>
          {device.data?.persisted === true
            ? 'Your lists are kept on this device, and the browser will not clear them.'
            : device.data?.persisted === false
              ? 'The browser may clear your lists from this device if it runs short of space. What has been synced is safe on the server.'
              : 'Whether the browser will keep your lists on this device is not known yet.'}
        </p>
      </div>

      <div className={styles.group}>
        <h2>Couldn’t sync</h2>
        {problem ? <Alert variant="error">{problem}</Alert> : null}
        {rows.length === 0 ? (
          <p className={styles.muted}>
            Nothing is waiting here. A change the server cannot take is kept here with the reason,
            so that nothing you typed is lost.
          </p>
        ) : (
          <ul className={styles.list} aria-label="Changes that could not be synced">
            {rows.map(({ entry, targets }) => (
              <FailedRow
                key={entry.n}
                entry={entry}
                targets={targets}
                onMove={async (listId) => {
                  setProblem(null);
                  if (!(await client?.move(entry.n, listId)))
                    setProblem('That could not be moved. Discard it, or try another list.');
                }}
                onDiscard={() => setDiscarding(entry)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className={styles.group}>
        <h2>Reset this device</h2>
        <p className={styles.muted}>
          Sends what is waiting, then clears this device and loads your lists again. Use it if this
          device shows something out of date or odd.
        </p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            loading={resetting === 'working'}
            disabled={!client || resetting === 'working'}
            onClick={() => void reset()}
          >
            Reset this device
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        title="Discard this change?"
        message={
          <>
            <strong>{discarding?.what}</strong> will be gone for good. {discarding?.sentence}
          </>
        }
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          if (discarding) void client?.discard(discarding.n);
          setDiscarding(null);
        }}
      />
      <ConfirmDialog
        open={asking !== null}
        onClose={() => {
          answer.current?.(false);
          setAsking(null);
        }}
        title="Reset anyway?"
        message={
          asking
            ? `${[
                asking.unsent > 0
                  ? `${asking.unsent} ${asking.unsent === 1 ? 'change' : 'changes'} could not be sent`
                  : '',
                asking.refused > 0
                  ? `${asking.refused} ${asking.refused === 1 ? 'change' : 'changes'} could not be synced`
                  : '',
              ]
                .filter(Boolean)
                .join(' and ')}, and will be lost.`
            : ''
        }
        confirmLabel="Reset"
        destructive
        onConfirm={() => answer.current?.(true)}
      />
    </>
  );
}

function FailedRow({
  entry,
  targets,
  onMove,
  onDiscard,
}: {
  entry: Entry;
  targets: ListRow[];
  onMove(listId: string): Promise<void>;
  onDiscard(): void;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = target || targets[0]?.id || '';
  return (
    <li className={styles.device}>
      <div>
        <strong>{entry.what}</strong>
        <span className={styles.hint}>{entry.sentence}</span>
        <span className={styles.hint}>{when(entry.failedAt)}</span>
      </div>
      <div className={styles.actions}>
        {targets.length > 0 ? (
          <>
            <Select
              aria-label={`List to move “${entry.what}” to`}
              value={chosen}
              onChange={(event) => setTarget(event.target.value)}
            >
              {targets.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={busy || chosen === ''}
              onClick={() => {
                setBusy(true);
                void onMove(chosen).finally(() => setBusy(false));
              }}
            >
              Move
            </Button>
          </>
        ) : null}
        <Button variant="secondary" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </li>
  );
}
