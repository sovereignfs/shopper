import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import '@sovereignfs/ui/tokens.css';
import './globals.css';
import { site } from '@/src/site';
import { themeScript } from '@/src/theme/script';
import { ToastProvider } from '@sovereignfs/ui';

// The typeface is Hanken Grotesk, which `@sovereignfs/ui` ships with its tokens and serves from this app's own origin: nothing is fetched from
// another site, and no font is loaded here.

export const metadata: Metadata = {
  title: { default: site.title, template: `%s · ${site.name}` },
  description: site.description,
  icons: { icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }] },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The proxy made a nonce for this request and put it in the policy; the theme script is inline and runs only with it (DESIGN.md §21). Reading the
  // request's headers also makes every page rendered per request, which is what lets Next put the nonce on the scripts it makes.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // `data-theme` is set by the script before first paint, so the server's HTML and the page's attributes differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
