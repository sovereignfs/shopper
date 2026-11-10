import type { Metadata, Viewport } from 'next';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
