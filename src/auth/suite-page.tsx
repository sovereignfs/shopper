import { notFound, redirect } from 'next/navigation';
import { AuthLink } from '@sovereignfs/ui';
import { oauthErrorMessage } from './messages';
import { authSettings } from './server';
import { getSession } from './session';
import { type CorePrompt, destination, suiteStep } from './suite';
import { AuthShell } from './screens/AuthShell';

/**
 * `/sign-in` and `/sign-up` in suite mode (RFC 0005): a redirect, or, back from core with `?error=`, the reason and _Try again_. Nothing for a
 * standalone instance, whose pages render their forms instead: the caller asks `authSettings()?.sovereign` first.
 */
export async function SuitePage({
  query,
  prompt,
}: {
  query: { error?: string | string[]; next?: string | string[]; returnTo?: string | string[] };
  /** `create` for `/sign-up`, which opens core's sign-up (Create an account); none for `/sign-in`. */
  prompt?: CorePrompt;
}) {
  if (!authSettings()?.sovereign) notFound();
  const error = typeof query.error === 'string' ? query.error : undefined;
  const step = suiteStep((await getSession()) !== null, error, destination(query), prompt);
  if (step.kind === 'go') redirect(step.to);
  return (
    <AuthShell
      title="Sign in to Shopper"
      lead={oauthErrorMessage(step.error) ?? undefined}
      footer={<AuthLink href={step.retry}>Try again</AuthLink>}
      footerAlign="start"
    />
  );
}
