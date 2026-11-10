import type { Metadata } from 'next';
import { sectionOf, one } from '@/src/account/query';
import { DeleteAccountSection } from '@/src/account/DeleteAccountSection';
import { PasswordSection } from '@/src/account/PasswordSection';
import { ProfileSection } from '@/src/account/ProfileSection';
import { ThisDeviceSection } from '@/src/account/ThisDeviceSection';
import { SettingsShell } from '@/src/account/SettingsShell';
import { accountHasPassword } from '@/src/auth/password';
import { authSettings } from '@/src/auth/server';
import { requireSession } from '@/src/auth/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings (DESIGN.md §17): the person's profile, how they sign in, and their data. Each section is rendered here, by the server, and handed to the shell,
 * which only shows one. This device is the exception: it is read from the device's own store, in the browser.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const settings = authSettings();
  return (
    <SettingsShell
      initial={sectionOf({ section: one(query.section) })}
      panels={{
        profile: <ProfileSection name={session.user.name} email={session.user.email} />,
        device: <ThisDeviceSection />,
        'sign-in': (
          <PasswordSection
            hasPassword={await accountHasPassword(session.user.id)}
            minLength={settings?.passwordMinLength ?? 10}
          />
        ),
        data: <DeleteAccountSection />,
      }}
    />
  );
}
