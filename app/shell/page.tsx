import type { Metadata } from 'next';
import { ShellFrame } from '@/src/screens/ShellFrame';
import { EmptyState } from '@sovereignfs/ui';

export const metadata: Metadata = {
  title: { absolute: 'Shopper' },
  robots: { index: false, follow: false },
};

/**
 * The one page the service worker keeps (DESIGN.md §16.11, task 1.12), answered for a signed-in address when there is no network. **It holds nothing of
 * a person** and asks nothing of the session: it is the same for everyone. Until the screens exist it shows the frame and says so.
 */
export default function ShellPage() {
  return (
    <ShellFrame>
      <EmptyState icon="list-todo" heading="Shopper" description="The lists are not here yet." />
    </ShellFrame>
  );
}
