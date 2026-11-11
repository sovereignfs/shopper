import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OfflineApp } from '@/src/screens/OfflineApp';

export const metadata: Metadata = {
  title: { absolute: 'Shopper' },
  robots: { index: false, follow: false },
};

/**
 * The one page the service worker keeps (DESIGN.md §16.11, task 1.12), answered for a signed-in address when there is no network. **It holds nothing of
 * a person** and asks nothing of the session: it is the same for everyone, and is the page the app starts from on a device with no server to ask. Who is
 * signed in is found on the device, in the browser (`OfflineApp`).
 */
export default function ShellPage() {
  return (
    <Suspense fallback={null}>
      <OfflineApp />
    </Suspense>
  );
}
