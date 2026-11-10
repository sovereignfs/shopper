import type { Unit } from '../quantity/units';
import { OTHER, STARTER_CATEGORIES } from './categories';
import type { GroceryIcon } from './icons';
import { normaliseName } from './name';

/**
 * **The starter catalog** (DESIGN.md §8.6): the common groceries Shopper ships with, in English, **so that the first list comes right**: a product made
 * from an entry takes its category, icon and default unit and quantity, and suggestions offer entries the household has no product for. It is data, not
 * rows: a household's product is made from an entry when the household first adds it, and the entry is only read after that.
 *
 * About 190 in 0.1.0, on the icons the design system already has; a larger set with grocery icons of their own is task 4.8. **The owner reviews this list**
 * in the pull request that adds it, and any release can add to it. A name is the English one a shop uses; `aliases` are the other names for the same thing
 * (_courgette_ and _zucchini_), and `plural` says that the name with an _s_ is the same product (_apple_ and _apples_), which is the only place the
 * trailing-plural rule of `canonicalName` (`canonical.ts`) is ever applied: "peas" and "hummus" are not plurals.
 */
export interface StarterEntry {
  readonly key: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** A starter category's key (`categories.ts`). */
  readonly category: string;
  readonly icon: GroceryIcon;
  readonly unit: Unit | null;
  readonly quantity: string | null;
  /** Whether the name with an _s_ is the same product. */
  readonly plural: boolean;
}

type Row = readonly [
  name: string,
  icon?: GroceryIcon | '',
  unit?: Unit | '',
  quantity?: string,
  aliases?: readonly string[],
  plural?: boolean,
];

const slug = (name: string) =>
  normaliseName(name)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

function section(category: string, defaultIcon: GroceryIcon, rows: readonly Row[]): StarterEntry[] {
  return rows.map(([name, icon, unit, quantity, aliases, plural]) => ({
    key: slug(name),
    name,
    aliases: aliases ?? [],
    category,
    icon: icon === undefined || icon === '' ? defaultIcon : icon,
    unit: unit === undefined || unit === '' ? null : unit,
    quantity: quantity ?? null,
    plural: plural ?? false,
  }));
}

export const STARTER_CATALOG: readonly StarterEntry[] = [
  ...section('produce', 'apple', [
    ['Apple', 'apple', 'pcs', '6', [], true],
    ['Banana', 'banana', 'pcs', '6', [], true],
    ['Orange', 'apple', 'pcs', '4', [], true],
    ['Lemon', 'apple', 'pcs', '2', [], true],
    ['Lime', 'apple', 'pcs', '2', [], true],
    ['Pear', 'apple', 'pcs', '4', [], true],
    ['Grapes', 'apple', 'kg', '0.5'],
    ['Strawberries', 'apple', 'pack', '1'],
    ['Blueberries', 'apple', 'pack', '1'],
    ['Raspberries', 'apple', 'pack', '1'],
    ['Watermelon', 'apple', 'pcs', '1'],
    ['Melon', 'apple', 'pcs', '1', [], true],
    ['Pineapple', 'apple', 'pcs', '1', [], true],
    ['Mango', 'apple', 'pcs', '2', ['Mangoes'], true],
    ['Avocado', 'apple', 'pcs', '2', [], true],
    ['Tomato', 'salad', 'pcs', '6', ['Tomatoes']],
    ['Cherry tomatoes', 'salad', 'pack', '1'],
    ['Cucumber', 'salad', 'pcs', '1', [], true],
    ['Lettuce', 'salad', 'pcs', '1'],
    ['Spinach', 'salad', 'bag', '1'],
    ['Rocket', 'salad', 'bag', '1', ['Arugula']],
    ['Kale', 'salad', 'bag', '1'],
    ['Broccoli', 'carrot', 'pcs', '1'],
    ['Cauliflower', 'carrot', 'pcs', '1'],
    ['Carrot', 'carrot', 'kg', '1', [], true],
    ['Potato', 'carrot', 'kg', '2', ['Potatoes']],
    ['Sweet potato', 'carrot', 'kg', '1', ['Sweet potatoes']],
    ['Onion', 'carrot', 'kg', '1', [], true],
    ['Red onion', 'carrot', 'pcs', '2', [], true],
    ['Spring onion', 'carrot', 'bunch', '1', ['Scallion', 'Scallions', 'Spring onions']],
    ['Garlic', 'carrot', 'pcs', '1', ['Garlic bulb']],
    ['Ginger', 'carrot'],
    ['Bell pepper', 'carrot', 'pcs', '3', ['Pepper', 'Peppers'], true],
    ['Courgette', 'carrot', 'pcs', '2', ['Zucchini'], true],
    ['Aubergine', 'carrot', 'pcs', '1', ['Eggplant'], true],
    ['Mushrooms', 'carrot', 'pack', '1'],
    ['Celery', 'salad', 'pcs', '1'],
    ['Cabbage', 'salad', 'pcs', '1'],
    ['Sweetcorn', 'carrot', 'pcs', '2', ['Corn']],
    ['Green beans', 'carrot', 'pack', '1'],
    ['Beetroot', 'carrot', 'pack', '1'],
    ['Leek', 'carrot', 'pcs', '2', [], true],
    ['Basil', 'salad', 'pack', '1'],
    ['Parsley', 'salad', 'bunch', '1'],
    ['Coriander', 'salad', 'bunch', '1', ['Cilantro']],
    ['Mint', 'salad', 'bunch', '1'],
  ]),
  ...section('bakery', 'croissant', [
    ['Bread', 'croissant', 'pcs', '1'],
    ['Sourdough', 'croissant', 'pcs', '1'],
    ['Baguette', 'croissant', 'pcs', '1', [], true],
    ['Bread rolls', 'croissant', 'pack', '1', ['Rolls']],
    ['Bagels', 'croissant', 'pack', '1'],
    ['Croissants', 'croissant', 'pack', '1'],
    ['Tortilla wraps', 'croissant', 'pack', '1', ['Wraps', 'Tortillas']],
    ['Pitta bread', 'croissant', 'pack', '1', ['Pita']],
    ['Naan', 'croissant', 'pack', '1'],
    ['Cake', 'croissant', 'pcs', '1'],
    ['Muffins', 'croissant', 'pack', '1'],
  ]),
  ...section('dairy-eggs', 'milk', [
    ['Milk', 'milk', 'L', '1'],
    ['Oat milk', 'milk', 'L', '1'],
    ['Almond milk', 'milk', 'L', '1'],
    ['Soya milk', 'milk', 'L', '1', ['Soy milk']],
    ['Butter', 'milk', 'pack', '1'],
    ['Cheese', 'milk', 'pack', '1'],
    ['Cheddar', 'milk', 'pack', '1'],
    ['Mozzarella', 'milk', 'pack', '1'],
    ['Parmesan', 'milk', 'pack', '1'],
    ['Feta', 'milk', 'pack', '1'],
    ['Cream cheese', 'milk', 'pack', '1'],
    ['Goat cheese', 'milk', 'pack', '1', ['Goats cheese']],
    ['Cream', 'milk', 'pack', '1'],
    ['Sour cream', 'milk', 'pack', '1'],
    ['Yoghurt', 'milk', 'pack', '1', ['Yogurt']],
    ['Greek yoghurt', 'milk', 'pack', '1', ['Greek yogurt']],
    ['Eggs', 'egg', 'dozen', '1'],
  ]),
  ...section('meat-fish', 'beef', [
    ['Chicken breast', 'drumstick', 'pack', '1', ['Chicken breasts']],
    ['Chicken thighs', 'drumstick', 'pack', '1'],
    ['Whole chicken', 'drumstick', 'pcs', '1'],
    ['Minced beef', 'beef', 'pack', '1', ['Ground beef', 'Beef mince']],
    ['Beef steak', 'beef', 'pack', '1', ['Steak']],
    ['Pork chops', 'beef', 'pack', '1'],
    ['Bacon', 'beef', 'pack', '1'],
    ['Sausages', 'beef', 'pack', '1'],
    ['Lamb', 'beef', 'pack', '1'],
    ['Salmon', 'fish', 'pack', '1', ['Salmon fillets']],
    ['Tuna steak', 'fish', 'pack', '1'],
    ['Cod', 'fish', 'pack', '1'],
    ['Prawns', 'fish', 'pack', '1', ['Shrimp']],
  ]),
  ...section('deli', 'drumstick', [
    ['Ham', 'drumstick', 'pack', '1'],
    ['Salami', 'drumstick', 'pack', '1'],
    ['Hummus', 'drumstick', 'pack', '1', ['Houmous']],
    ['Olives', 'drumstick', 'jar', '1'],
    ['Coleslaw', 'drumstick', 'pack', '1'],
  ]),
  ...section('frozen', 'snowflake', [
    ['Frozen peas', 'snowflake', 'bag', '1'],
    ['Frozen vegetables', 'snowflake', 'bag', '1'],
    ['Frozen berries', 'snowflake', 'bag', '1'],
    ['Frozen spinach', 'snowflake', 'bag', '1'],
    ['Frozen pizza', 'pizza', 'pcs', '1', [], true],
    ['Ice cream', 'snowflake', 'pack', '1'],
    ['Fish fingers', 'fish', 'pack', '1'],
    ['Oven chips', 'snowflake', 'bag', '1', ['Frozen fries']],
  ]),
  ...section('pantry', 'package', [
    ['Pasta', 'package', 'pack', '1'],
    ['Spaghetti', 'package', 'pack', '1'],
    ['Rice', 'package', 'bag', '1'],
    ['Basmati rice', 'package', 'bag', '1'],
    ['Noodles', 'package', 'pack', '1'],
    ['Couscous', 'package', 'pack', '1'],
    ['Flour', 'package', 'kg', '1'],
    ['Sugar', 'package', 'kg', '1'],
    ['Salt', 'package', 'pack', '1'],
    ['Black pepper', 'package', 'pack', '1'],
    ['Olive oil', 'package', 'bottle', '1'],
    ['Vegetable oil', 'package', 'bottle', '1'],
    ['Vinegar', 'package', 'bottle', '1'],
    ['Soy sauce', 'package', 'bottle', '1'],
    ['Passata', 'package', 'jar', '1'],
    ['Chopped tomatoes', 'package', 'can', '2', ['Canned tomatoes', 'Tinned tomatoes']],
    ['Baked beans', 'package', 'can', '2'],
    ['Chickpeas', 'package', 'can', '2'],
    ['Lentils', 'package', 'pack', '1'],
    ['Kidney beans', 'package', 'can', '2'],
    ['Tuna', 'fish', 'can', '2', ['Tinned tuna', 'Canned tuna']],
    ['Coconut milk', 'package', 'can', '1'],
    ['Stock cubes', 'package', 'pack', '1'],
    ['Curry paste', 'package', 'jar', '1'],
    ['Honey', 'package', 'jar', '1'],
    ['Jam', 'package', 'jar', '1'],
    ['Peanut butter', 'package', 'jar', '1'],
    ['Mayonnaise', 'package', 'jar', '1'],
    ['Ketchup', 'package', 'bottle', '1'],
    ['Mustard', 'package', 'jar', '1'],
    ['Baking powder', 'package', 'pack', '1'],
    ['Yeast', 'package', 'pack', '1'],
  ]),
  ...section('breakfast', 'egg', [
    ['Cereal', 'package', 'box', '1'],
    ['Muesli', 'package', 'bag', '1'],
    ['Porridge oats', 'package', 'bag', '1', ['Oats']],
    ['Granola', 'package', 'bag', '1'],
    ['Maple syrup', 'package', 'bottle', '1'],
    ['Pancake mix', 'package', 'pack', '1'],
  ]),
  ...section('snacks-sweets', 'cookie', [
    ['Crisps', 'cookie', 'pack', '1'],
    ['Chocolate', 'candy', 'pcs', '1'],
    ['Biscuits', 'cookie', 'pack', '1', ['Cookies']],
    ['Crackers', 'cookie', 'pack', '1'],
    ['Nuts', 'cookie', 'bag', '1', ['Mixed nuts']],
    ['Peanuts', 'cookie', 'bag', '1'],
    ['Popcorn', 'cookie', 'bag', '1'],
    ['Sweets', 'candy', 'bag', '1', ['Candy']],
    ['Dried fruit', 'cookie', 'bag', '1'],
  ]),
  ...section('drinks', 'cup-soda', [
    ['Water', 'cup-soda', 'bottle', '6'],
    ['Sparkling water', 'cup-soda', 'bottle', '6'],
    ['Orange juice', 'cup-soda', 'bottle', '1'],
    ['Apple juice', 'cup-soda', 'bottle', '1'],
    ['Cola', 'cup-soda', 'bottle', '2'],
    ['Lemonade', 'cup-soda', 'bottle', '1'],
    ['Squash', 'cup-soda', 'bottle', '1', ['Cordial']],
    ['Tea', 'coffee', 'box', '1', ['Tea bags']],
    ['Coffee', 'coffee', 'pack', '1', ['Coffee beans']],
    ['Instant coffee', 'coffee', 'jar', '1'],
    ['Wine', 'wine', 'bottle', '1'],
    ['Beer', 'beer', 'bottle', '6'],
  ]),
  ...section('household', 'spray-can', [
    ['Toilet paper', 'package', 'pack', '1', ['Toilet roll']],
    ['Kitchen roll', 'package', 'pack', '1'],
    ['Washing-up liquid', 'spray-can', 'bottle', '1'],
    ['Dishwasher tablets', 'package', 'box', '1'],
    ['Laundry detergent', 'spray-can', 'box', '1', ['Washing powder']],
    ['Fabric softener', 'spray-can', 'bottle', '1'],
    ['Bin bags', 'package', 'pack', '1'],
    ['Sponges', 'package', 'pack', '1'],
    ['Cleaning spray', 'spray-can', 'bottle', '1'],
    ['Bleach', 'spray-can', 'bottle', '1'],
    ['Aluminium foil', 'package', 'pcs', '1', ['Tin foil']],
    ['Cling film', 'package', 'pcs', '1'],
    ['Baking paper', 'package', 'pcs', '1'],
    ['Light bulbs', 'package', 'pack', '1'],
    ['Batteries', 'package', 'pack', '1'],
    ['Candles', 'package', 'pack', '1'],
  ]),
  ...section('personal-care', 'package', [
    ['Toothpaste', 'package', 'pcs', '1'],
    ['Toothbrush', 'package', 'pcs', '1', [], true],
    ['Shampoo', 'spray-can', 'bottle', '1'],
    ['Conditioner', 'spray-can', 'bottle', '1'],
    ['Shower gel', 'spray-can', 'bottle', '1'],
    ['Soap', 'package', 'pcs', '1'],
    ['Deodorant', 'spray-can', 'pcs', '1'],
    ['Razors', 'package', 'pack', '1'],
    ['Tissues', 'package', 'box', '1'],
    ['Sunscreen', 'spray-can', 'bottle', '1'],
    ['Plasters', 'package', 'box', '1'],
  ]),
  ...section('baby', 'package', [
    ['Nappies', 'package', 'pack', '1', ['Diapers']],
    ['Baby wipes', 'package', 'pack', '1'],
    ['Baby food', 'package', 'jar', '4'],
    ['Baby formula', 'package', 'can', '1', ['Formula']],
  ]),
  ...section('pets', 'package', [
    ['Dog food', 'package', 'bag', '1'],
    ['Cat food', 'package', 'pack', '1'],
    ['Cat litter', 'package', 'bag', '1'],
  ]),
];

const index = new Map<string, StarterEntry>();
const singulars = new Set<string>();
for (const entry of STARTER_CATALOG) {
  for (const each of [entry.name, ...entry.aliases]) index.set(normaliseName(each), entry);
  if (entry.plural) {
    singulars.add(normaliseName(entry.name));
    index.set(`${normaliseName(entry.name)}s`, entry);
  }
}

/** Whether a normalised name is a starter singular whose name with an _s_ is the same product: the one case the plural rule strips. */
export function isStarterSingular(normalised: string): boolean {
  return singulars.has(normalised);
}

/** The starter entry for a name, by its normalised form: the name, an alias, or (where the entry says so) the name with an _s_. */
export function starterEntryFor(name: string): StarterEntry | undefined {
  return index.get(normaliseName(name));
}

/**
 * The category key the starter catalog gives a name, for `guessCategory` (DESIGN.md §8.3): the entry for the whole name, and failing that the entry for its
 * last word, then the words before it (_goat cheese_ is _cheese_), since the thing is the last word of what it is.
 */
export function starterCategoryFor(normalised: string): string | undefined {
  const whole = index.get(normalised);
  if (whole) return whole.category;
  const words = normalised.split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    const entry = index.get(words[i] ?? '');
    if (entry) return entry.category;
  }
  return undefined;
}

/** Every starter category key a catalog entry names exists: held by the schema test. */
export const STARTER_CATEGORY_KEYS: ReadonlySet<string> = new Set(
  STARTER_CATEGORIES.map((c) => c.key),
);
export { OTHER };
