/** The text of a request's body, or `null` if it is longer than `limit` characters: nothing is read beyond what a route is prepared to hold. */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  const text = await request.text();
  return text.length > limit ? null : text;
}
