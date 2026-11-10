// What an orchestrator asks: is this process up. It answers 200 once the server is serving; task 1.5 makes it wait for the database as well.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
