'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState } from '@sovereignfs/ui';
import { type CoreKeySettings, coreKeys } from './core-client';

/**
 * Core's answer, read from the address (sdk §9.3): `receive()` takes it out of the fragment before anything else, checks it, and keeps the key for this
 * session; then the person goes back to where they were. A refusal is said, with a way to ask again. Nothing of the answer is sent anywhere.
 */
export function KeyReturn(settings: CoreKeySettings) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    coreKeys(settings)
      .receive()
      .then((received) => {
        if (received.ok) window.location.replace(received.returnPath);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
    // Once, when the page opens: the answer is in the address only until it is read.
  }, []);

  if (!failed)
    return (
      <EmptyState icon="list-todo" heading="Unlocking your lists…" description="Taking you back." />
    );
  return (
    <Alert variant="error">
      Your lists could not be unlocked.{' '}
      <Button onClick={() => void coreKeys(settings).unlock('/')}>Try again</Button>{' '}
      <a href="/">Back to your lists</a>
    </Alert>
  );
}
