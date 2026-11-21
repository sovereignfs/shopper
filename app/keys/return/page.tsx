import { redirect } from 'next/navigation';
import { requireSession } from '@/src/auth/session';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { KeyReturn } from '@/src/keys/KeyReturn';
import { keySourceOf } from '@/src/keys/server/source';

// The key return address (`encryption.return` in the manifest, RFC 0001): core sends the person back here with the app's key, sealed to this browser.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unlocking' };

export default async function KeyReturnPage() {
  const session = await requireSession();
  const source = await keySourceOf(session.user.id);
  if (source?.kind !== 'core') redirect('/');
  return (
    <AuthShell title="Unlocking">
      <KeyReturn core={source.core} clientId={source.clientId} returnTo={source.returnTo} />
    </AuthShell>
  );
}
