import { env } from "@/lib/env";
import { userForFeedToken, workerCalendarIcs } from "@/lib/worker/calendar-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/werker-agenda/<token>.ics — a worker's own diensten as a
// subscribable agenda (Google Agenda, Apple Agenda, Outlook). The secret token
// in the URL is the only credential: calendar apps can't send headers. Made and
// renewed in the app under Account → Diensten in je eigen agenda.
export async function GET(_request: Request, props: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await props.params;
  const userId = await userForFeedToken(token.replace(/\.ics$/, ""));
  if (!userId) return new Response("Onbekende of vernieuwde agenda-link", { status: 404 });
  const body = await workerCalendarIcs(userId, env.APP_BASE_URL.replace(/\/+$/, ""));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="zekerflex-mijn-diensten.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
