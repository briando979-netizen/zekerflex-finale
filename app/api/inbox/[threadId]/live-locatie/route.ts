import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getThread, werkLiveLocatieBij } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live locatie in een gesprek (lib/messaging/live-locatie.ts), zoals in WhatsApp. Alleen de afzender:
//   POST { messageId, lat, lng } → nieuwe plek (hooguit eens per 10 s opgeslagen; vaker is geen fout) → { location }
//   POST { messageId, stop: true } → vroeg stoppen; de laatste plek blijft in het bericht staan → { location }
// Is de deling voorbij (verlopen of gestopt), dan 410 met code LIVE_VOORBIJ: de browser stopt dan met sturen. Voor wie
// niet de afzender is, bestaat de deling niet (404). Geen 403: de browser stuurt dit elke paar seconden (CrowdSec, AGENTS.md).

const schema = z.union([
  z.object({ messageId: z.string().min(1).max(40), lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) }),
  z.object({ messageId: z.string().min(1).max(40), stop: z.literal(true) }),
]);

export async function POST(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) throw AppError.validation("Ongeldige plek");
    const change = "stop" in body.data ? { stop: true as const } : { lat: body.data.lat, lng: body.data.lng };
    const uit = await werkLiveLocatieBij(thread.id, body.data.messageId, p.userId, change);
    if ("fout" in uit) {
      return uit.fout === "voorbij"
        ? NextResponse.json({ error: { code: "LIVE_VOORBIJ", message: "Het live delen is gestopt." } }, { status: 410 })
        : NextResponse.json({ error: { code: "NOT_FOUND", message: "Deze live locatie bestaat niet (meer)." } }, { status: 404 });
    }
    return NextResponse.json({ location: uit.message.location });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
