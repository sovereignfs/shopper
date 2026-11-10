/**
 * What an action is given besides the rows it needs: the time, and a way to make an id. **Both are parameters**, so that an action is pure and a test
 * calls it with a time and ids of its own, and the same action runs in the browser and on the server (the server uses it for what it does on a person's
 * behalf, such as a fold). In the browser `newId` is `crypto.randomUUID`.
 */
export interface Env {
  readonly now: number;
  newId(): string;
}

/** The fields of `values` that differ from `row`, and only those: what a mutation says. Equal values are not changes. */
export function changed<R extends object>(
  row: R,
  values: Partial<Record<keyof R, unknown>>,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if ((row as Record<string, unknown>)[key] !== value) out[key] = value as string | number | null;
  }
  return out;
}
