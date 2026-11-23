import { redirect } from 'next/navigation';
import { one, sectionBefore } from '@/src/account/query';
import { SettingsRoute } from '@/src/account/SettingsRoute';
import { HomeScreen } from '@/src/screens/HomeScreen';

export const dynamic = 'force-dynamic';

/**
 * `/settings` **loaded directly** (RFC 0005, DESIGN.md §17): Home with the dialog open and no section named, which is the first on a wide screen and the sections
 * alone on a phone. The old `/settings?section=…` of before the settings dialog goes to the section that took the old one's place (`sectionBefore`).
 */
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const asked = one((await searchParams).section);
  if (asked !== undefined) redirect(`/settings/${sectionBefore(asked)}`);
  return (
    <>
      <HomeScreen />
      <SettingsRoute close="home" />
    </>
  );
}
