import { calendarIcs, tenantForCalendarToken } from "@/lib/integrations/employer-links";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/calendar/<token>.ics — the company's diensten as a
// subscribable agenda (Google Agenda, Outlook, Apple Agenda). The secret token
// in the URL is the only credential: calendar apps can't send headers. Made
// and rotated in Werkgever → Integraties.
export async function GET(_request: Request, props: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await props.params;
  const tenantId = await tenantForCalendarToken(token.replace(/\.ics$/, ""));
  if (!tenantId) return new Response("Onbekende of verlopen agenda-link", { status: 404 });
  const body = await calendarIcs(tenantId, env.APP_BASE_URL.replace(/\/+$/, ""));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="zekerflex-diensten.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
