import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isId } from '@/src/actions/format';
import { ShopScreen } from '@/src/screens/ShopScreen';

export const metadata: Metadata = { title: 'Shopping' };
export const dynamic = 'force-dynamic';

/**
 * Shopping mode (DESIGN.md §11), at `/shop?h=<household>&l=<list>`: one list in 0.1.0, in the address phase 2 keeps (§11.2). Like a list, the page holds nothing
 * of it: the session is checked by the layout and `ShopScreen` reads the list from the device, so it works with no network once it is open. An address
 * without a list that is an id is not found; one the device does not have is said so on the page.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { l } = await searchParams;
  if (typeof l !== 'string' || !isId(l)) notFound();
  return <ShopScreen id={l} />;
}
