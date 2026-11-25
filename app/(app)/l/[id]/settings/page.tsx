import { notFound, redirect } from 'next/navigation';
import { isId } from '@/src/actions/format';

/**
 * A list's settings used to be a page here; they are a dialog over the list now, at `/l/<id>?settings=general` (RFC 0005, DESIGN.md §16.3), so that Back closes them
 * and a link opens them. This address is kept for a bookmark or a link from before, and holds nothing: it goes to the dialog. The device's shell does the same with no network
 * (`OfflineApp`).
 */
export default async function ListSettingsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isId(id)) notFound();
  redirect(`/l/${id}?settings=general`);
}
