import { headers } from 'next/headers';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { authSettings, signUpAvailable } from '@/src/auth/server';
import { getSession } from '@/src/auth/session';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { previewInvitation } from '@/src/households/invitations';
import { RateLimiter } from '@/src/limits/rate';
import { AcceptInvite } from '@/src/screens/AcceptInvite';
import { AuthLink } from '@sovereignfs/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation', robots: { index: false, follow: false } };

/** Opening links is counted by address: someone trying tokens is slowed long before they could find one. */
const RATE = { limit: 60, windowMs: 10 * 60_000 };

/**
 * **An invitation** (DESIGN.md §7.3), at `/invite/<token>`, for anyone. It says the household's name and who invited, **and nothing else**, and it is **one
 * page for every link that does not work** (unknown, expired, used or revoked). It offers to sign in or make an account, and the link survives that round
 * trip; under a closed instance it says an account is needed first. Signed in, it offers to join. Whoever holds the link can accept it.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const database = await getDatabase();
  const address = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const taken = await new RateLimiter(database).take(`invite-open:${address}`, RATE);
  if (!taken.ok)
    return <AuthShell title="Too many tries" lead="Wait a few minutes and open the link again." />;

  const preview = await previewInvitation(database, getConfig().encryption, token, Date.now());
  if (!preview)
    return (
      <AuthShell
        title="This link does not work"
        lead="It may have expired, been used already or been taken back. Ask whoever sent it for a new one."
        footer={<AuthLink href="/">Go to Shopper</AuthLink>}
        footerAlign="start"
      />
    );

  const lead = `${preview.invitedBy ? `${preview.invitedBy} invited you` : 'You are invited'} to shop together. You will see and edit every list in ${preview.household}.`;
  if (await getSession())
    return (
      <AuthShell title={`Join ${preview.household}`} lead={lead}>
        <AcceptInvite token={token} />
      </AuthShell>
    );

  const next = encodeURIComponent(`/invite/${token}`);
  const settings = authSettings();
  const canSignUp = await signUpAvailable();
  return (
    <AuthShell
      title={`Join ${preview.household}`}
      lead={lead}
      footer={
        canSignUp ? undefined : (
          <>
            An account is needed first, and this Shopper is not taking new ones. Sign in if you have
            one.
          </>
        )
      }
    >
      {settings ? (
        <p>
          <AuthLink href={`/sign-in?next=${next}`}>Sign in</AuthLink>
          {canSignUp ? (
            <>
              {' '}
              or <AuthLink href={`/sign-up?next=${next}`}>create an account</AuthLink> to join.
            </>
          ) : null}
        </p>
      ) : null}
    </AuthShell>
  );
}
