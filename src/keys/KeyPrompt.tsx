'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, FormField, Input, LockedState } from '@sovereignfs/ui';
import { useKeys } from './keys';

/**
 * What a signed-in page shows while the key is locked and there is a network to unlock it with (RFC 0001): `LockedState`, with core's Unlock or the
 * password, above the lists, which stay as the device has them. With no network it shows nothing: the lists work, and the sync waits. **The box is read
 * when the form is sent,** since a password manager can fill it without telling the page; it has no name, so a browser that sent the form itself would put
 * nothing of it in the address.
 */
export function KeyPrompt() {
  const keys = useKeys();
  const [online, setOnline] = useState(true);
  const box = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (keys.current.state !== 'locked' || !online) return null;

  if (keys.kind === 'core')
    return (
      <LockedState
        reason="locked"
        appName="Shopper"
        action={<Button onClick={() => void keys.unlock()}>Unlock</Button>}
      />
    );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setWrong(false);
    const opened = await keys.unlock(box.current?.value ?? '');
    setBusy(false);
    // Opened, the prompt goes, and its box with it.
    if (!opened) setWrong(true);
  }

  return (
    <LockedState
      reason="locked"
      appName="Shopper"
      action={
        <form onSubmit={(event) => void onSubmit(event)} aria-label="Unlock">
          <FormField
            label="Your password"
            error={wrong ? 'That does not open your lists.' : undefined}
          >
            {(field) => (
              <Input
                {...field}
                ref={box}
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
              />
            )}
          </FormField>
          <Button type="submit" loading={busy}>
            Unlock
          </Button>
        </form>
      }
    />
  );
}
