/**
 * **The one function that decides who sees an email** (DESIGN.md §6.1): the person themselves, and the Admins of a household they are in. Nobody else:
 * not another member, and never in a notice or in an export of someone else. Everything that shows an email asks this, with what it knows, so that the
 * rule is in one place and a test can hold the rest of the code to it.
 *
 * Pure. `adminOfSharedHousehold` is whether the viewer is an active Admin of a household the target is an active member of, which the caller reads in
 * the same statement that reads the rows (task 3.2), since the permission is in the statement.
 */
export function canSeeEmail(input: {
  viewerAccountId: string;
  targetAccountId: string | null;
  adminOfSharedHousehold: boolean;
}): boolean {
  if (input.targetAccountId !== null && input.viewerAccountId === input.targetAccountId)
    return true;
  return input.adminOfSharedHousehold;
}

/** A person as another sees them: the name, and the email only where `canSeeEmail` allows it. */
export function asSeenBy<T extends { name: string; email: string | null }>(
  person: T,
  visible: boolean,
): Omit<T, 'email'> & { email: string | null } {
  return { ...person, email: visible ? person.email : null };
}
