import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { weigerOverdracht } from "@/lib/kyc/overdracht";

// POST /api/id-overdracht/weiger — op de telefoon "Dit is niet mijn account": de
// code vervalt meteen, er wordt niets ingeleverd en de laptop ziet "geweigerd".
// Iemand stuurde mogelijk een link om met andermans ID een account te bevestigen
// (review H1): dat komt in het auditspoor, zodat een beoordelaar het ziet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-weiger", identifier: clientIp(request), limit: 20, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown; toestel?: unknown };
    const w = await weigerOverdracht(typeof body.code === "string" ? body.code : "", typeof body.toestel === "string" ? body.toestel : null);
    if (!w) throw AppError.notFound("Deze link is niet (meer) geldig.");
    await recordAudit({
      category: "SECURITY",
      action: "kyc.overdracht.niet_mijn_account",
      severity: "warning",
      actorLabel: "system",
      summary: "ID-scan via een tweede toestel geweigerd: op de telefoon gekozen voor 'dit is niet mijn account'",
      targetType: "user",
      targetId: w.userId,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
