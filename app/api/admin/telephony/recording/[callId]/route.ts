import { withAdminAccess } from "@/lib/auth/handlers";
import { getCall } from "@/lib/telephony/store";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/telephony/recording/<callId> — streamt de Twilio-opname via de
// (admin-beveiligde) eigen server. De Twilio-opname-URL vereist Basic-auth met
// SID+token; die zit op de server, niet in de browser. Zo kan de beheerder de
// opname gewoon afspelen zonder bij Twilio in te loggen.
export const GET = withAdminAccess<{ callId: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const rec = await getCall(params.callId);
  if (!rec?.recordingUrl) return new Response("Geen opname voor deze oproep.", { status: 404 });

  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return new Response("Telefonie niet geconfigureerd.", { status: 412 });

  const upstream = await fetch(rec.recordingUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("Opname is (nog) niet beschikbaar bij Twilio.", { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "cache-control": "private, no-store",
      "accept-ranges": "bytes",
    },
  });
});
