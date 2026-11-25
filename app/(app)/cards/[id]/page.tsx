import { notFound } from 'next/navigation';
import { isId } from '@/src/actions/format';
import { CardScreen } from '@/src/screens/CardScreen';

export const dynamic = 'force-dynamic';

/**
 * A card, full screen (DESIGN.md §16.14), at `/cards/<id>`. The page holds nothing of it: the session is checked by the layout, the address is only a place, and **the card is read from the
 * device** by `CardScreen`, which is why it opens with no network. An address that is not an id is not found; one that is an id the device does not have is said so on the page, since a card
 * another person owns reads the same as one that is not there (DESIGN.md §5.2).
 */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  return <CardScreen id={id} />;
}
