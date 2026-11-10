/**
 * **What a household is called on screen** (DESIGN.md §7.4). A household with a name is called by it. One that has none, which in 0.1.0 is every one,
 * is called by the person it was made for: "My lists" to its owner, and to everyone else "Kasun's lists", the owner's name from `person`; "Shared lists"
 * once its owner is gone or when it was never anyone's first. Pure, so the sidebar, the sharing dialog and the invitation page say one thing.
 */
export function householdLabel(input: {
  name: string | null;
  /** Whether the reader is the account this household was made for. */
  viewerIsOwner: boolean;
  /** The name of the person it was made for, or `null` if it was made for none or they are gone. */
  ownerName: string | null;
}): string {
  if (input.name !== null && input.name.trim() !== '') return input.name;
  if (input.viewerIsOwner) return 'My lists';
  if (input.ownerName !== null && input.ownerName.trim() !== '')
    return `${input.ownerName.trim()}’s lists`;
  return 'Shared lists';
}
