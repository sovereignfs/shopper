import { notFound } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { ResetForm } from '@/src/auth/screens/ResetForm';
import { authSettings, mailAvailable } from '@/src/auth/server';
import { AuthLink } from '@sovereignfs/ui';
import { resetAddress } from '@/src/auth/reset';
import { getVaultId } from '@/src/keys/server/vault';

// Choosing a new password with the link that was sent (DESIGN.md §6). The token is in the address and is good once; the page finds the address it was
// sent to, which the new password is derived with (RFC 0001).
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const settings = authSettings();
  if (!settings || !mailAvailable()) notFound();
  const { token } = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      footer={<AuthLink href="/sign-in">Back to sign in</AuthLink>}
    >
      <ResetForm
        minLength={settings.passwordMinLength}
        vaultId={await getVaultId()}
        email={typeof token === 'string' ? await resetAddress(token) : null}
      />
    </AuthShell>
  );
}
