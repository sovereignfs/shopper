import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import '@sovereignfs/ui/tokens.css';
import './globals.css';
import { site } from '@/src/site';

// The typeface is Hanken Grotesk, which `@sovereignfs/ui` ships with its tokens and serves from this app's own origin: nothing is fetched from
// another site, and no font is loaded here.

export const metadata: Metadata = {
  title: { default: site.title, template: `%s · ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page has a nonce of its own (proxy.ts), so every page is rendered per request: Next puts the nonce from the request's policy on the scripts
  // it makes only for a page that is not prerendered.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
