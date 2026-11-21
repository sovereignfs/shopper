import { answerCoreExport } from '@/src/portability/core-export';

export const dynamic = 'force-dynamic';

/**
 * Core asks for Shopper's part of a person's export (RFC 0003, the manifest's `signIn.export`). Its signed token is the credential: no session, no
 * cookie, no `Origin`. Not found where Sovereign sign-in is not set up.
 */
export async function POST(request: Request): Promise<Response> {
  return (await answerCoreExport(request)) ?? new Response(null, { status: 404 });
}
