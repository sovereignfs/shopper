import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isId } from '@/src/actions/format';
import { ListScreen } from '@/src/screens/ListScreen';

export const metadata: Metadata = { title: 'List' };
export const dynamic = 'force-dynamic';

/**
 * A list (DESIGN.md §16.5), at `/l/<id>`. The page holds nothing of it: the session is checked by the layout, the address is only a place, and **what is on
 * the list is read from the device** by `ListScreen`, which is why it opens with no network. An address that is not an id is not found; one that is an id the
 * device does not have is said so on the page, since a list another household owns reads the same as one that is not there (DESIGN.md §5.2).
 */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  return <ListScreen id={id} />;
}
