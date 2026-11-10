'use client';

import { Button, ButtonLink, EmptyState } from '@sovereignfs/ui';

/**
 * A page that failed to render. It says so, **says plainly that nothing is lost** (what is on the device is not touched, and what was typed is in its
 * outbox), offers to try again, and offers a way back; it never shows the error, which can name an address.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EmptyState
      icon="refresh-cw"
      heading="Something went wrong"
      description="Nothing you added is lost. Try again, and if it keeps happening, go back and reload."
      action={
        <>
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Go back to Shopper
          </ButtonLink>
        </>
      }
    />
  );
}
