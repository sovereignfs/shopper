import { redirect } from 'next/navigation';
import { one, sectionBefore } from '@/src/account/query';

/**
 * `/settings`, and the old `/settings?section=…` of before the settings dialog (RFC 0005): both go to a section's own address, which is Profile for a bare
 * `/settings` and the section that took the old one's place (`sectionBefore`) for the rest. There is no page here.
 */
export default async function SettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  redirect(`/settings/${sectionBefore(one((await searchParams).section))}`);
}
