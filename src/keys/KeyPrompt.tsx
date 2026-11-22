'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button, FormField, Input, LockedState } from '@sovereignfs/ui';
import { useKeys } from './keys';

/**
 * What a signed-in page shows while the key is locked and there is a network to unlock it with (RFC 0001): `LockedState`, with core's Unlock or the
 * password, above the lists, which stay as the device has them. With no network it shows nothing: the lists work, and the sync waits.
 */
export function KeyPrompt() {
  const keys = useKeys();
  const [online, setOnline] = useState(true);
  const [password, setPassword] = useState('');
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
    const opened = await keys.unlock(password);
    setBusy(false);
    if (opened) setPassword('');
    else setWrong(true);
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
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
