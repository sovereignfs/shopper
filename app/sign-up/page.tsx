import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { SignUpForm } from '@/src/auth/screens/SignUpForm';
import { authSettings, mailAvailable, signUpAvailable } from '@/src/auth/server';
import { nextQuery, safeNext } from '@/src/auth/next';
import { getSession } from '@/src/auth/session';
import { AuthLink } from '@sovereignfs/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const settings = authSettings();
  if (!settings?.local) notFound();
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next ?? '/');

  if (!(await signUpAvailable())) {
    return (
      <AuthShell
        title="Sign-up is closed"
        lead="Shopper is not taking new accounts. If you have one, sign in; otherwise ask whoever runs this instance."
        footer={<AuthLink href={`/sign-in${nextQuery(next)}`}>Go to sign in</AuthLink>}
        footerAlign="start"
      />
    );
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already have an account? <AuthLink href={`/sign-in${nextQuery(next)}`}>Sign in</AuthLink>
        </>
      }
    >
      <SignUpForm minLength={settings.passwordMinLength} mail={mailAvailable()} next={next} />
    </AuthShell>
  );
}
