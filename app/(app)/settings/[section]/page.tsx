import { notFound } from 'next/navigation';
import { sectionOf } from '@/src/account/query';
import { SettingsRoute } from '@/src/account/SettingsRoute';
import { HomeScreen } from '@/src/screens/HomeScreen';

export const dynamic = 'force-dynamic';

/**
 * Settings **loaded directly** (RFC 0005, DESIGN.md §17): `/settings/<section>` from a link, a reload or a new tab shows Home with the dialog open, so that Settings
 * always looks the same. Opened from a page, the intercepting route (`@modal/(.)settings/[section]`) puts the dialog over that page instead. An address that is
 * not a section is not found; the old `/settings?section=…` is `../page.tsx`.
 */
export default async function Settings({ params }: { params: Promise<{ section: string }> }) {
  if (!sectionOf((await params).section)) notFound();
  return (
    <>
      <HomeScreen />
      <SettingsRoute close="home" />
    </>
  );
}
