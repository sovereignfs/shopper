'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import {
  AppFrame,
  type AppSidebarItem,
  type AppSidebarAction,
  type AppSidebarLinkProps,
  Icon,
} from '@sovereignfs/ui';
import { placesOf, type Place } from '../local/places';
import { useLocalOptional, useLocalQuery } from '../local/react';
import { site } from '../site';
import { ArchivedToggle } from './ArchivedToggle';
import { NEW_LIST, archivedCount, blocksOf } from './blocks';
import { migrateSidebar } from './migrate';
import { NewListDialog } from './NewListDialog';
import { addressOf, pageKind } from './page-kind';
import { Wordmark } from './Wordmark';

/**
 * **The frame of every signed-in page** (RFC 0005, DESIGN.md §16.2, §16.11): `@sovereignfs/ui`'s `AppFrame`, which draws the header, the sidebar, the content and, on a phone,
 * the header, the content, the footer and a drawer, and which makes `#sv-app-shell`, the root overlays portal into. Shopper gives it only what is its own: the wordmark, the
 * blocks (`blocksOf`, from the places the device holds), _New list_ and the toggle for archived lists, the footer's places, the avatar's menu, and, in suite mode, the
 * launcher (`launcher`). **The same routes on both:** the frame decides what is drawn by the screen, and nothing here changes an address; no Shopper file asks for a width
 * (`src/ui/no-fork.test.ts`). The right column for an item is not the frame's: the list and shopping mode place it (`ItemBeside`), where the item's data is.
 *
 * The page the service worker keeps, before the device has a working copy to read, has no lists to show, and shows Home alone.
 */
export function SignedInFrame({
  account,
  launcher,
  children,
}: {
  /** The person's avatar menu, for a signed-in page. */
  account: ReactNode;
  /** The apps the person may open, in suite mode: drawn at the right of the header on a wide screen, and never on a phone. */
  launcher?: ReactNode;
  children: ReactNode;
}) {
  // The sidebar's remembered choices were kept under another key before the frame was the design system's: carried across once, before the frame reads them.
  useState(() => {
    if (typeof window !== 'undefined') migrateSidebar(window.localStorage);
    return null;
  });
  const local = useLocalOptional();
  return local ? (
    <WithLists account={account} launcher={launcher}>
      {children}
    </WithLists>
  ) : (
    <Frame places={[]} account={account} launcher={launcher}>
      {children}
    </Frame>
  );
}

/** The frame with the lists the device holds. */
function WithLists({
  account,
  launcher,
  children,
}: {
  account: ReactNode;
  launcher: ReactNode;
  children: ReactNode;
}) {
  const places = useLocalQuery(placesOf).data ?? [];
  return (
    <Frame places={places} account={account} launcher={launcher}>
      {children}
    </Frame>
  );
}

/**
 * A row is a link where it has an address, which is Next's, so that a click is a client navigation. _New list_ has one only so that following it closes the phone's
 * drawer (`NEW_LIST`): it is drawn as the button it is, and goes nowhere.
 */
const link = (item: AppSidebarItem | AppSidebarAction, props: AppSidebarLinkProps): ReactNode =>
  item.href === NEW_LIST ? (
    <button
      type="button"
      className={props.className}
      aria-label={props['aria-label']}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  ) : (
    <Link {...props} />
  );

function Frame({
  places,
  account,
  launcher,
  children,
}: {
  places: readonly Place[];
  account: ReactNode;
  launcher: ReactNode;
  children: ReactNode;
}) {
  const pathname = addressOf(usePathname());
  const [archived, setArchived] = useState(false);
  const [naming, setNaming] = useState<Place | null>(null);
  const away = archivedCount(places);
  const blocks = blocksOf({
    places,
    pathname,
    archived: archived && away > 0,
    onNew: setNaming,
  });
  return (
    <>
      <AppFrame
        appId="shopper"
        name={site.name}
        brand={<Wordmark name={site.name} />}
        pageKind={pageKind(pathname)}
        blocks={blocks}
        renderLink={link}
        sidebarFooter={
          <ArchivedToggle count={away} shown={archived} onToggle={() => setArchived(!archived)} />
        }
        avatarMenu={account}
        {...(launcher ? { launcher } : {})}
        // Shopping mode has the whole screen (DESIGN.md §16.11): its own Finish shopping is where the footer would be.
        {...(pathname === '/shop'
          ? {}
          : {
              footer: {
                // Home, the lists' drawer in the middle, and, until the loyalty cards have a page (24.3), Settings: the footer needs one on each side.
                leftIcons: [
                  {
                    icon: <Icon name="house" size="md" aria-hidden />,
                    label: 'Home',
                    href: '/',
                    active: pathname === '/',
                  },
                ],
                rightIcons: [
                  {
                    icon: <Icon name="settings" size="md" aria-hidden />,
                    label: 'Settings',
                    href: '/settings',
                    active: pathname === '/settings' || pathname.startsWith('/settings/'),
                  },
                ],
                launcherLabel: 'Lists',
                launcherIcon: <Icon name="list-todo" size="md" aria-hidden />,
              },
            })}
      >
        {children}
      </AppFrame>
      {naming ? <NewListDialog place={naming} onClose={() => setNaming(null)} /> : null}
    </>
  );
}
