import type { ReactNode } from 'react';
import { requireSession } from '@/src/auth/session';
import { LocalProvider } from '@/src/local/react';
import { AccountMenu } from '@/src/screens/AccountMenu';
import { ShellFrame } from '@/src/screens/ShellFrame';
import { UndoProvider } from '@/src/screens/Undo';

// Everything for someone who is signed in (DESIGN.md §16.2): the session is checked here, and the frame is the one the offline shell makes too.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <LocalProvider accountId={session.user.id}>
      {/* A tick, an untick and _Clear bought_ offer Undo (DESIGN.md §12.7): kept here, so that the whole signed-in area has it. */}
      <UndoProvider>
        <ShellFrame account={<AccountMenu name={session.user.name} email={session.user.email} />}>
          {children}
        </ShellFrame>
      </UndoProvider>
    </LocalProvider>
  );
}
