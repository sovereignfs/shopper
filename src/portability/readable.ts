import {
  type Keyring,
  boundTo,
  deriveListKeyring,
  openField,
  unwrapKeyring,
  unwrapListKeyring,
} from '../keys/household';

/**
 * **A person's readable export** (RFC 0005, "A readable export"), made in the browser: the server serves the person's records as it holds them
 * (`personRecords`, the same ones core's export of a person takes), and this opens what was encrypted for the person with the keys the browser holds and
 * writes one JSON file. **Nothing here runs on the server, and no opened value leaves the page.** Pure and browser-safe (WebCrypto only), so it is tested
 * with no browser.
 *
 * The keys themselves are never in the file: a wrapped keyring is the person's, and a copy of it in a file they pass around is a way to open their
 * lists. A value this browser cannot open (a key it does not have, a value that was changed) is `null` and counted in `unopened`, said aloud and never
 * left out silently. No one else's email is in it (the server leaves it out).
 */
export interface ServedRecords {
  readonly kind: string;
  readonly records: readonly Record<string, unknown>[];
  /** Whether these are a moved group's ciphertext, which this opens. */
  readonly endToEnd: boolean;
}

export interface ReadableHead {
  readonly format: 1;
  readonly kind: 'person';
  readonly producer: { readonly name: 'shopper'; readonly version: string };
  readonly takenAt: string;
  /** The records are opened: this is not the contract's sealed export. */
  readonly readable: true;
}

export interface ReadableExport {
  readonly export: ReadableHead;
  /** How many values this browser could not open, which are `null` in `records`. */
  readonly unopened: number;
  /** One list of rows per kind: `person`, `household`, `member`, `list`, `item`, `product`, `category`, `inventory_item`. */
  readonly records: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}

const ENCRYPTED = /^(.+)_encrypted$/;
/** The kinds that hold the person's keys, which are not written out. */
const KEYS = new Set(['household_key', 'list_key']);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The keyring of each list this person can open, from their own records of keys: their copies first, else derived from the group's. */
async function listRings(
  served: readonly ServedRecords[],
  appKey: CryptoKey,
  person: string,
): Promise<(list: string) => Promise<Keyring | undefined>> {
  const of = (kind: string) => served.find((each) => each.kind === kind)?.records ?? [];
  const households = new Map<string, Keyring>();
  for (const row of of('household_key')) {
    const household = text(row.household);
    const record = text(row.record);
    if (!household || !record) continue;
    const ring = await unwrapKeyring(appKey, record, { person, household });
    if (ring) households.set(household, ring);
  }
  const householdOf = new Map<string, string>();
  for (const kind of ['list', 'list_encrypted'])
    for (const row of of(kind)) {
      const id = text(row.id);
      const household = text(row.householdId) ?? text(row.household_id);
      if (id && household) householdOf.set(id, household);
    }
  const copies = new Map<string, string>();
  for (const row of of('list_key')) {
    const list = text(row.list);
    const record = text(row.record);
    if (list && record) copies.set(list, record);
  }
  const rings = new Map<string, Keyring | undefined>();
  return async (list) => {
    if (rings.has(list)) return rings.get(list);
    let ring: Keyring | undefined;
    const copy = copies.get(list);
    if (copy) ring = await unwrapListKeyring(appKey, copy, { person, list });
    if (!ring) {
      const group = households.get(householdOf.get(list) ?? '');
      if (group) ring = await deriveListKeyring(group, list);
    }
    rings.set(list, ring);
    return ring;
  };
}

/** The rows of every kind the server served, with what was encrypted for the person opened under their keys. Throws nothing for a value it cannot open. */
export async function openServed(
  served: readonly ServedRecords[],
  appKey: CryptoKey,
  head: { readonly version: string; readonly takenAt: string },
): Promise<ReadableExport> {
  const person = text(served.find((each) => each.kind === 'person')?.records[0]?.id) ?? '';
  const ringOf = await listRings(served, appKey, person);
  const records: Record<string, Record<string, unknown>[]> = {};
  let unopened = 0;
  for (const part of served) {
    if (KEYS.has(part.kind)) continue;
    const moved = ENCRYPTED.exec(part.kind)?.[1];
    const kind = moved ?? part.kind;
    const into = (records[kind] ??= []);
    for (const row of part.records) {
      if (!moved) {
        const { content, ...rest } = row as { content?: Record<string, unknown> } & Record<
          string,
          unknown
        >;
        into.push({ ...rest, ...(content ?? {}) });
        continue;
      }
      const { content, ...rest } = row as { content?: Record<string, unknown> } & Record<
        string,
        unknown
      >;
      const opened: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(content ?? {})) {
        const bound = typeof value === 'string' ? boundTo(value) : undefined;
        const ring = bound ? await ringOf(bound.list) : undefined;
        const clear =
          bound && ring && typeof value === 'string'
            ? await openField(
                ring,
                { list: bound.list, table: kind, row: String(row.id), field },
                value,
                [bound.row],
              )
            : undefined;
        if (clear === undefined) unopened += 1;
        opened[field] = clear ?? null;
      }
      into.push({ ...rest, ...opened });
    }
  }
  return {
    export: {
      format: 1,
      kind: 'person',
      producer: { name: 'shopper', version: head.version },
      takenAt: head.takenAt,
      readable: true,
    },
    unopened,
    records,
  };
}

/** The file's name: `shopper-export-<date>.json`. */
export const exportFileName = (takenAt: string): string =>
  `shopper-export-${takenAt.slice(0, 10)}.json`;

/** The file's text: readable, two spaces. */
export const exportFileText = (file: ReadableExport): string =>
  `${JSON.stringify(file, null, 2)}\n`;
