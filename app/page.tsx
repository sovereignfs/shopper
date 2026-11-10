import { Landing } from '@/src/landing/Landing';
import { site } from '@/src/site';
import { AppShell } from '@/src/ui/AppShell';

// The front address (DESIGN.md §16.4). For a visitor, this page; for someone with a session cookie, the proxy has already answered the request with the
// signed-in area's front page (`/home`, which resolves to their last list) before it gets here, and the address stays `/`.
export default function Front() {
  return (
    <AppShell name={site.name}>
      <Landing />
    </AppShell>
  );
}
