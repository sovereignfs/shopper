import { notFound } from 'next/navigation';
import { sectionOf } from '@/src/account/query';
import { SettingsRoute } from '@/src/account/SettingsRoute';

export const dynamic = 'force-dynamic';

/**
 * Settings **opened from a page** (RFC 0005, DESIGN.md §17): Next's intercepting route for `/settings/<section>`, so that the dialog is over the page it was
 * opened from, which stays where it is, and Back closes it. Loaded directly the address is `../../settings/[section]/page.tsx`, over Home.
 */
export default async function SettingsOverPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const section = sectionOf((await params).section);
  if (!section) notFound();
  return <SettingsRoute section={section} close="back" />;
}
