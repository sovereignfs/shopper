import type { CategoryRow } from '../actions/rows';
import { OTHER, starterCategory } from '../catalog/categories';
import { type GroceryIcon, isGroceryIcon } from '../catalog/icons';
import type { InventoryEntry } from '../catalog/inventory';
import { normaliseName } from '../catalog/name';
import { categoryOfEntry } from './screen';

/**
 * **What the Categories tab shows** (DESIGN.md §16.8, §8.3), pure so that the screen and the tests make the same view: the person's group's categories, **in the aisle order**,
 * the starter ones as they named them and their own, hidden ones too (to show again), each with the icon it is drawn with, how many Inventory items are under it, and what can be
 * done to it: a starter category is renamed, hidden and moved and never deleted, a category of their own is deleted too, and _Other_ is never hidden.
 */
export interface CategoryLine {
  readonly category: CategoryRow;
  /** The icon drawn: its own, else the starter's, else the default (the design system's set only: a value this build does not know is the default). */
  readonly icon: GroceryIcon;
  /** How many items of Inventory are shown under it (those whose category is hidden or deleted are under _Other_). */
  readonly count: number;
  readonly canHide: boolean;
  readonly canDelete: boolean;
  /** A starter category the person has given a name: it can take the usual one back. */
  readonly renamed: boolean;
}

const DEFAULT_ICON: GroceryIcon = 'shopping-basket';

const byPosition = (a: CategoryRow, b: CategoryRow): number =>
  a.position === b.position ? a.id.localeCompare(b.id) : a.position < b.position ? -1 : 1;

export function linesOf(
  categories: readonly CategoryRow[],
  entries: readonly InventoryEntry[],
): CategoryLine[] {
  const live = categories.filter((each) => each.deletedAt === null);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const under = categoryOfEntry(entry, live);
    if (under) counts.set(under.id, (counts.get(under.id) ?? 0) + 1);
  }
  return [...live].sort(byPosition).map((category) => {
    const starter = category.starterKey === null ? undefined : starterCategory(category.starterKey);
    const icon =
      category.icon && isGroceryIcon(category.icon)
        ? category.icon
        : starter && isGroceryIcon(starter.icon)
          ? starter.icon
          : DEFAULT_ICON;
    return {
      category,
      icon,
      count: counts.get(category.id) ?? 0,
      canHide: category.starterKey !== OTHER,
      canDelete: category.starterKey === null,
      renamed: starter !== undefined && category.name !== starter.name,
    };
  });
}

/** Whether another live category has the name already, by what a person would call the same (capitals and spaces do not make a second one). */
export function nameTaken(
  categories: readonly CategoryRow[],
  name: string,
  except: string | null = null,
): boolean {
  const wanted = normaliseName(name);
  return categories.some(
    (each) => each.deletedAt === null && each.id !== except && normaliseName(each.name) === wanted,
  );
}

/** The last position in the aisle order, which a new category goes after; `null` when there are none. */
export function lastPosition(categories: readonly CategoryRow[]): string | null {
  const live = categories.filter((each) => each.deletedAt === null);
  return live.length === 0 ? null : ([...live].sort(byPosition).at(-1)?.position ?? null);
}
