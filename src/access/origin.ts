/**
 * **A route that changes something checks `Origin`** (DESIGN.md §21): a write is accepted only from a page of this app, so that another site cannot have a
 * signed-in person's browser make one for it. The cookie alone would be sent along; the `Origin` header would not be this address. A request with
 * none is refused too: a browser always sends it with a `POST`. Pure.
 */
export function sameOrigin(request: Pick<Request, 'headers'>, appUrl: string): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
