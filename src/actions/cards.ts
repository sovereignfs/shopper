import type { CodeKind } from '../cards/kinds';
import { type Env, changed } from './env';
import type { Mutation } from './format';
import type { CardRow } from './rows';

/**
 * **The actions on loyalty cards** (DESIGN.md §7.7, RFC 0007): make, change and put in order, each a pure function to a mutation, or `null` when it would change nothing. A card is made in
 * the person's **own group** (`householdId`), where they are its Admin; everything a person writes on it is a field the transport encrypts under the card's keys. **Who may change one is the
 * server's to say** (its Admin alone); `canChange` is only what the screen offers. Deleting one is not here: it is its Admin's online operation (`card.delete`).
 */
export interface CardFields {
  readonly shop: string;
  readonly number: string;
  readonly kind: CodeKind;
  readonly code: string;
  readonly icon?: string | null;
  readonly color?: string | null;
  readonly holder?: string | null;
  readonly note?: string | null;
}

/** A new card in the person's own group, `last` being the position of the last card they have (`null` if none): it goes after it. */
export function makeCard(
  env: Env,
  input: { householdId: string; position: string } & CardFields,
): Mutation {
  const { householdId, position, icon, color, holder, note, ...required } = input;
  return {
    mutationId: env.newId(),
    householdId,
    changes: [
      {
        table: 'card',
        id: env.newId(),
        create: true,
        fields: {
          ...required,
          ...(icon ? { icon } : {}),
          ...(color ? { color } : {}),
          ...(holder ? { holder } : {}),
          ...(note ? { note } : {}),
          position,
          createdAt: env.now,
        },
      },
    ],
  };
}

/**
 * Changes what differs: the shop, the number, the kind and the code, and an icon, a colour, the name on the card and a note (`null` clears one of those). Each is its own field, so that what
 * someone else changed in another is not written over.
 */
export function changeCard(env: Env, card: CardRow, input: Partial<CardFields>): Mutation | null {
  return one(env, card, { ...input });
}

/** Puts a card in a place among the person's cards, which they change by dragging. */
export function moveCard(env: Env, card: CardRow, position: string): Mutation | null {
  return one(env, card, { position });
}

/** Whether the screen offers to change a card: only its Admin does (the server holds it to that). */
export const canChange = (role: 'admin' | 'member' | undefined): boolean => role === 'admin';

function one(
  env: Env,
  card: CardRow,
  fields: Record<string, string | number | null | undefined>,
): Mutation | null {
  const differing = changed(card, fields);
  if (Object.keys(differing).length === 0) return null;
  return {
    mutationId: env.newId(),
    householdId: card.householdId,
    changes: [{ table: 'card', id: card.id, fields: differing }],
  };
}
