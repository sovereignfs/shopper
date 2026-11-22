import { redirect } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { safeNext } from '@/src/auth/next';
import { accountHasPassword } from '@/src/auth/password';
import { requireSession } from '@/src/auth/session';
import { getVaultId } from '@/src/keys/server/vault';
import { KitScreen } from '@/src/keys/KitScreen';

// The recovery kit, once, after the keys are made (RFC 0001, DESIGN.md §13.2). A password account's alone: through core, the kit is core's.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your recovery kit' };

export default async function KitPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await requireSession();
  const next = safeNext((await searchParams).next);
  if (!(await accountHasPassword(session.user.id))) redirect(next ?? '/');
  return (
    <AuthShell title="Keep your recovery kit">
      <KitScreen vaultId={await getVaultId()} next={next} />
    </AuthShell>
  );
}
