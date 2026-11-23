import { Avatar } from '@sovereignfs/ui';
import { coreLink } from '../auth/core-links';
import styles from './Account.module.css';

/**
 * What Settings says in suite mode (RFC 0005, DESIGN.md §17): **core owns** the person's profile, how they sign in, their key's recovery, appearance,
 * notifications and the account itself, so Shopper shows what core told it and goes there, and copies none of it. Server components with no state: a link
 * is the whole of what there is to do.
 */

/** Who core says the person is, read only, with a way to change it there. */
export function CoreProfile({
  name,
  email,
  picture,
  core,
}: {
  name: string;
  email: string;
  picture: string | undefined;
  core: string;
}) {
  return (
    <>
      <div className={styles.group}>
        <h2>Profile</h2>
        <div className={styles.row}>
          <Avatar name={name} {...(picture ? { src: picture } : {})} size="lg" />
          <div>
            <p>
              <strong>{name}</strong>
            </p>
            <p>{email}</p>
          </div>
        </div>
        <p className={styles.muted}>
          This is who Sovereign says you are, and it is the same in every app you use there.{' '}
          <a href={coreLink(core, '/profile')}>Edit in Sovereign</a>.
        </p>
      </div>
    </>
  );
}

/** How the person signs in and where their key is kept: core's, with links to its pages. */
export function CoreSecurity({ core }: { core: string }) {
  return (
    <>
      <div className={styles.group}>
        <h2>Sign-in</h2>
        <p className={styles.muted}>
          You sign in through Sovereign, which has your password, passkeys and two-factor sign-in.{' '}
          <a href={coreLink(core, '/security')}>Open Sovereign’s security</a>.
        </p>
      </div>
      <div className={styles.group}>
        <h2>Keys and recovery kit</h2>
        <p className={styles.muted}>
          Your key, your recovery kit and the passkeys that unlock it are Sovereign’s, for every app
          that encrypts what you write. <a href={coreLink(core, '/keys')}>Open your keys</a>.
        </p>
      </div>
    </>
  );
}

/** Deleting the account is core's: it deletes the Sovereign account, and Shopper is told. */
export function CoreDelete({ core }: { core: string }) {
  return (
    <div className={styles.group}>
      <h2>Delete account</h2>
      <p className={styles.muted}>
        Your account is Sovereign’s, so deleting it is done there; Shopper is told and deletes
        everything of yours. <a href={coreLink(core, '/delete-account')}>Delete it in Sovereign</a>.
      </p>
    </div>
  );
}
