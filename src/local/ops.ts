/**
 * **The online operations, from the browser** (DESIGN.md §12.8): `POST /api/ops`, which answers at once and is not queued. Deleting a list for good is one: it
 * is an Admin's, it needs the server, and it says why it was refused in a sentence. Every way it can fail is a value, not an exception.
 */
export type OperationResult = { ok: true } | { ok: false; message: string };

export async function callOperation(
  body: Record<string, unknown>,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<OperationResult> {
  let reply: Response;
  try {
    reply = await fetcher('/api/ops', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: 'This needs a connection. Try again when you are back online.' };
  }
  const answer = (await reply.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (reply.ok && answer.ok) return { ok: true };
  if (reply.status === 401)
    return { ok: false, message: 'You have been signed out. Sign in again.' };
  if (answer.message) return { ok: false, message: answer.message };
  return { ok: false, message: 'That is not there any more, or is not yours to change.' };
}
