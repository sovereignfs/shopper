import { redirect } from 'next/navigation';
import { one, sectionBefore } from '@/src/account/query';
import { SettingsRoute } from '@/src/account/SettingsRoute';

export const dynamic = 'force-dynamic';

/**
 * `/settings` **opened from a page**: the dialog over it with no section named, which is the first on a wide screen and the sections alone on a phone. An old
 * `/settings?section=…` goes to the section's own address, as `../../settings/page.tsx` does for one loaded directly.
 */
export default async function SettingsOverPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const asked = one((await searchParams).section);
  if (asked !== undefined) redirect(`/settings/${sectionBefore(asked)}`);
  return <SettingsRoute close="back" />;
}
