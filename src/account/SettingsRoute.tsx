import { CoreDelete, CoreProfile, CoreSecurity } from './CoreSections';
import { DeleteAccountSection } from './DeleteAccountSection';
import { EncryptionSection } from './EncryptionSection';
import { ExportSection } from './ExportSection';
import { NotificationsSection } from './NotificationsSection';
import { PasswordSection } from './PasswordSection';
import { PreferencesSection } from './PreferencesSection';
import { ProfileSection } from './ProfileSection';
import { SettingsHost } from './SettingsHost';
import { ThisDeviceSection } from './ThisDeviceSection';
import { accountHasPassword } from '../auth/password';
import { accountFacts } from '../auth/profile';
import { authSettings } from '../auth/server';
import { requireSession } from '../auth/session';
import { getVaultId } from '../keys/server/vault';
import styles from './Account.module.css';

/**
 * Settings, rendered by the server (RFC 0005, DESIGN.md §17): every section for **the mode the instance is in** (§15.1), with what only the server knows (whether
 * the account has a password, its vault), handed to the dialog, which only shows one: the address says which. The session is asked for here, since a
 * `'use server'` function and a page's guard protect nothing of their own (AGENTS.md). The same for the dialog over a page and the one over Home: the route
 * decides how it closes.
 */
export async function SettingsRoute({ close }: { close: 'back' | 'home' }) {
  const session = await requireSession();
  const settings = authSettings();
  const vaultId = await getVaultId();
  // In suite mode core's address, which the sections go to, and the picture it has of the person (RFC 0005); running alone, neither.
  const core = settings?.sovereign?.issuer ?? null;
  const { picture, locale, timeZone } = await accountFacts(session);
  return (
    <SettingsHost
      close={close}
      panels={{
        profile: (
          <div className={styles.panel}>
            {core ? (
              <CoreProfile
                name={session.user.name}
                email={session.user.email}
                picture={picture}
                core={core}
              />
            ) : (
              <ProfileSection name={session.user.name} email={session.user.email} />
            )}
          </div>
        ),
        security: (
          <div className={styles.panel}>
            {core ? (
              <CoreSecurity core={core} />
            ) : (
              <PasswordSection
                hasPassword={await accountHasPassword(session.user.id)}
                minLength={settings?.passwordMinLength ?? 10}
                email={session.user.email}
                vaultId={vaultId}
              />
            )}
            <EncryptionSection />
          </div>
        ),
        preferences: <PreferencesSection core={core} regional={{ locale, timeZone }} />,
        // Shopper's in both modes: nothing of core's can reach what this browser does with pushes, or the working copy it keeps.
        notifications: (
          <div className={styles.panel}>
            <NotificationsSection />
          </div>
        ),
        device: (
          <div className={styles.panel}>
            <ThisDeviceSection />
          </div>
        ),
        data: (
          <div className={styles.panel}>
            <ExportSection suite={core !== null} email={session.user.email} vaultId={vaultId} />
            {core ? (
              <CoreDelete core={core} />
            ) : (
              <DeleteAccountSection email={session.user.email} vaultId={vaultId} />
            )}
          </div>
        ),
      }}
    />
  );
}
