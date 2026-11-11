import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isId } from '@/src/actions/format';
import { ListSettings } from '@/src/screens/ListSettings';

export const metadata: Metadata = { title: 'List settings' };
export const dynamic = 'force-dynamic';

/** A list's settings (DESIGN.md §16.3), at `/l/<id>/settings`. As the list, it holds nothing of it: the device reads it, and the server decides what needs it. */
export default async function ListSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  return <ListSettings id={id} />;
}
