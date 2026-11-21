'use client';

import { usePush } from '@sovereignfs/pwa/client';
import { PushControl } from '@sovereignfs/ui';
import styles from './Account.module.css';

/**
 * Settings, Notifications (RFC 0002, DESIGN.md §17): notifications on this device, with `@sovereignfs/pwa`'s state and `@sovereignfs/ui`'s control,
 * which says plainly why a device cannot have them (an iPhone first needs Shopper on its Home Screen). With no push key on the server it shows nothing.
 */
export function NotificationsSection() {
  const push = usePush();
  return (
    <div className={styles.group}>
      <h2>Notifications</h2>
      <PushControl
        appName="Shopper"
        state={push.state}
        working={push.working}
        error={push.error}
        onTurnOn={() => void push.turnOn()}
        onTurnOff={() => void push.turnOff()}
      />
      <p className={styles.muted}>
        A notification says what happened and who did it, such as someone joining your household. It
        never names a list or an item.
      </p>
    </div>
  );
}
