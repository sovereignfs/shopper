'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@sovereignfs/ui';
import { isId } from '../actions/format';
import { type Identity, readIdentity } from '../identity';
import { LocalProvider } from '../local/react';
import { site } from '../site';
import { AppShell } from '../ui/AppShell';
import { AccountMenu } from './AccountMenu';
import { HomeScreen } from './HomeScreen';
import { ListScreen } from './ListScreen';
import { ListSettings } from './ListSettings';
import { ShellFrame } from './ShellFrame';
import { ShopScreen } from './ShopScreen';
import { UndoProvider } from './Undo';

/**
 * Shopper with no server document (DESIGN.md §16.11). The service worker answers a signed-in address with the one page it keeps, `/shell`, which holds
 * nothing of a person and is the same for everyone; this is what that page is. It finds who is signed in on the device (`src/identity.ts`), makes the
 * composition the server's layout makes, and **chooses the screen from the address**, since the page it came in is not the page of the address: the front
 * address and `/home` are the last list, `/l/<id>` that list, `/l/<id>/settings` its settings and `/shop?l=<id>` shopping mode. The screens read the
 * device's store and write through `commit`, so they need none of the server. Anything that does need it is not answered by the shell at all.
 */
const LIST = /^\/l\/([0-9a-f-]{36})$/;
const LIST_SETTINGS = /^\/l\/([0-9a-f-]{36})\/settings$/;

export function OfflineApp() {
  // Not known until the page is in the browser: the server renders nothing of a person.
  const [who, setWho] = useState<Identity | null | undefined>(undefined);
  useEffect(() => setWho(readIdentity()), []);

  if (who === undefined) return null;
  if (who === null)
    return (
      <AppShell name={site.name}>
        <EmptyState
          icon="list-todo"
          heading="Shopper"
          description="Sign in to use Shopper. This needs a connection."
          action={<Link href="/sign-in">Sign in</Link>}
        />
      </AppShell>
    );
  return (
    <LocalProvider accountId={who.id}>
      <UndoProvider>
        <ShellFrame account={<AccountMenu name={who.name} email={who.email} />}>
          <Screen />
        </ShellFrame>
      </UndoProvider>
    </LocalProvider>
  );
}

function Screen() {
  const pathname = usePathname();
  const params = useSearchParams();
  const settings = LIST_SETTINGS.exec(pathname)?.[1];
  if (settings) return <ListSettings id={settings} />;
  const list = LIST.exec(pathname)?.[1];
  if (list) return <ListScreen id={list} />;
  if (pathname === '/shop') {
    const id = params.get('l');
    return id && isId(id) ? <ShopScreen id={id} /> : <NotHere />;
  }
  return <HomeScreen />;
}

function NotHere() {
  return (
    <EmptyState
      icon="list-todo"
      heading="That is not here"
      description="Go back to your lists."
      action={<Link href="/">Your lists</Link>}
    />
  );
}
