import { PlainFrame } from '@/src/frame/PlainFrame';
import { ButtonLink, EmptyState } from '@sovereignfs/ui';

export const metadata = { title: 'Not found' };

/** A page, a list or a household that is not there, or is not this person's: the same answer for both (DESIGN.md §5.2), with a way back. */
export default function NotFound() {
  return (
    <PlainFrame>
      <EmptyState
        icon="search"
        heading="That is not here"
        description="It may have been deleted, or the address may be wrong."
        action={<ButtonLink href="/">Go back to Shopper</ButtonLink>}
      />
    </PlainFrame>
  );
}
