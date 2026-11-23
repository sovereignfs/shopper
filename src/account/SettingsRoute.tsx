import { DeleteAccountSection } from './DeleteAccountSection';
import { EncryptionSection } from './EncryptionSection';
import { ExportSection } from './ExportSection';
import { PasswordSection } from './PasswordSection';
import { PreferencesSection } from './PreferencesSection';
import { ProfileSection } from './ProfileSection';
import type { AccountSection } from './query';
import { SettingsHost } from './SettingsHost';
import { accountHasPassword } from '../auth/password';
import { authSettings } from '../auth/server';
import { requireSession } from '../auth/session';
import { getVaultId } from '../keys/server/vault';
import styles from './Account.module.css';

/**
 * Settings, rendered by the server (RFC 0005, DESIGN.md §17): every section for **the mode the instance is in** (§15.1), with what only the server knows (whether
 * the account has a password, its vault), handed to the dialog, which only shows one. The session is asked for here, since a `'use server'` function and a page's
 * guard protect nothing of their own (AGENTS.md). The same for the dialog over a page and the one over Home: the route decides which, and how it closes.
 */
export async function SettingsRoute({
  section,
  close,
}: {
  section: AccountSection;
  close: 'back' | 'home';
}) {
  const session = await requireSession();
  const settings = authSettings();
  const vaultId = await getVaultId();
  const suite = settings?.sovereign !== undefined;
  return (
    <SettingsHost
      section={section}
      close={close}
      panels={{
        profile: (
          <div className={styles.panel}>
            <ProfileSection name={session.user.name} email={session.user.email} />
          </div>
        ),
        security: (
          <div className={styles.panel}>
            <PasswordSection
              hasPassword={await accountHasPassword(session.user.id)}
              minLength={settings?.passwordMinLength ?? 10}
              email={session.user.email}
              vaultId={vaultId}
            />
            <EncryptionSection />
          </div>
        ),
        preferences: <PreferencesSection core={settings?.sovereign?.issuer ?? null} />,
        data: (
          <div className={styles.panel}>
            <ExportSection suite={suite} email={session.user.email} vaultId={vaultId} />
            <DeleteAccountSection email={session.user.email} vaultId={vaultId} />
          </div>
        ),
      }}
    />
  );
}
