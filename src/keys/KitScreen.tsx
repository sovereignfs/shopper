'use client';

import { useEffect, useState } from 'react';
import { formatKit } from '@sovereignfs/sdk/keys';
import { Alert, RecoveryKit } from '@sovereignfs/ui';
import { shopperVault } from './vault-client';

/**
 * The recovery kit, shown once (RFC 0001): 32 random bytes made here, shown as the SDK writes them, and given their way into the keys only once the
 * person says they kept it. Nobody else can open the lists without it after a forgotten password, and it is never sent anywhere. **Not yet audited.**
 */
export function KitScreen({ vaultId, next }: { vaultId: string; next: string | null }) {
  const [kit, setKit] = useState<{ bytes: Uint8Array; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const done = () => window.location.assign(next ?? '/');

  useEffect(() => {
    void (async () => {
      const vault = shopperVault(vaultId);
      if (!(await vault.kitPending())) return done();
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      setKit({ bytes, text: await formatKit(bytes) });
    })();
    // Once, when the page opens: `done` and the vault are the same for the page's life.
  }, []);

  async function keep() {
    if (!kit) return;
    setContinuing(true);
    setProblem(null);
    if (await shopperVault(vaultId).keepKit(kit.bytes)) return done();
    setContinuing(false);
    setProblem('That could not be saved. Check your connection, and press Continue again.');
  }

  if (!kit) return null;
  return (
    <>
      <p>
        Shopper encrypts your lists so that only you and the people you share them with can read
        them. If you forget your password, this kit is the only way back to them. Not yet audited.
      </p>
      {problem ? <Alert variant="error">{problem}</Alert> : null}
      <RecoveryKit
        kit={kit.text}
        instanceName="Shopper"
        onContinue={() => void keep()}
        continuing={continuing}
      />
    </>
  );
}
