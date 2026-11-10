import { type LimitKind, limitSentence } from '../limits/limits';

/**
 * **Why the server refused a mutation** (DESIGN.md §12.5), from a fixed list, each with a sentence a person can read in Couldn't sync. **A refusal reads
 * as not found**: a household the account is not in, a row that is not the household's, a reference to one that is not, and a row that is gone are one
 * reason, `not_found`, so that a refusal says nothing about what exists. Nothing a person typed is thrown away because of one: the device keeps it (task 6.3).
 */
export type Reason = 'not_found' | 'invalid' | 'limit' | 'duplicate' | 'unsupported';

export class Refusal extends Error {
  constructor(
    readonly reason: Reason,
    readonly sentence: string,
    readonly limit?: LimitKind,
  ) {
    super(reason);
    this.name = 'Refusal';
  }
}

/** The household, the row or what a field names is not there, or is not the account's to touch. */
export const notFound = () =>
  new Refusal('not_found', 'That is not there any more, or is not yours to change.');

export const invalid = (detail: string) =>
  new Refusal('invalid', `That could not be understood (${detail}).`);

export const limited = (kind: LimitKind, limit: number, name?: string) =>
  new Refusal('limit', limitSentence(kind, limit, name), kind);

/** A product with this name is already in the household (task 5.3 folds the two instead of refusing). */
export const duplicate = () =>
  new Refusal('duplicate', 'This household already has one with that name.');

/** The mutation names a kind of row the server does not apply yet. */
export const unsupported = (table: string) =>
  new Refusal('unsupported', `Changes to ${table} are not accepted by this server yet.`);
