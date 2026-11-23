import type { ReactNode } from 'react';
import { requireSession } from '@/src/auth/session';
import { KeyPrompt } from '@/src/keys/KeyPrompt';
import { KeysProvider, type PageKeySource } from '@/src/keys/keys';
import { keySourceOf } from '@/src/keys/server/source';
import { LocalProvider } from '@/src/local/react';
import { AccountMenu } from '@/src/screens/AccountMenu';
import { RememberIdentity } from '@/src/screens/RememberIdentity';
import { ShellFrame } from '@/src/screens/ShellFrame';
import { UndoProvider } from '@/src/screens/Undo';

// Everything for someone who is signed in (DESIGN.md §16.2): the session is checked here, and the frame is the one the offline shell makes too.
export const dynamic = 'force-dynamic';

// **No page here sets a title of its own on the server** (RFC 0005, DESIGN.md §16.13): a list's name is encrypted, so the browser sets every title in this area
// (`useTitle`, which also keeps it against Next making the `<title>` again), and the server's is the app's name for all of them.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const found = await keySourceOf(session.user.id);
  // What the page needs to open the key (RFC 0001), read for each request: never built into the bundle.
  const source: PageKeySource | undefined =
    found?.kind === 'vault'
      ? { kind: 'vault', vaultId: found.vaultId, email: session.user.email }
      : found?.kind === 'core'
        ? { kind: 'core', core: found.core, clientId: found.clientId, returnTo: found.returnTo }
        : undefined;
  return (
    <KeysProvider source={source}>
      <LocalProvider accountId={session.user.id}>
        {/* A tick, an untick and _Clear bought_ offer Undo (DESIGN.md §12.7): kept here, so that the whole signed-in area has it. */}
        <RememberIdentity
          accountId={session.user.id}
          name={session.user.name}
          email={session.user.email}
          keys={source}
        />
        <UndoProvider>
          <ShellFrame account={<AccountMenu name={session.user.name} email={session.user.email} />}>
            <KeyPrompt />
            {children}
          </ShellFrame>
        </UndoProvider>
      </LocalProvider>
    </KeysProvider>
  );
}
