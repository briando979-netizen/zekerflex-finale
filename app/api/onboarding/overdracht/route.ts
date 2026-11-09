import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { cleanImage } from "@/lib/media/clean-image";
import { annuleerOverdracht, maakOverdracht, overdrachtFoto, overdrachtStatus, overdrachtVoorbeeld } from "@/lib/kyc/overdracht";

// "Verder op je telefoon" (lib/kyc/overdracht.ts), de kant van de laptop. Alleen
// de eigen overdracht (achter de login):
//   POST                eenmalige code voor de QR-code (20 min)
//   GET                 hoe het staat ("wacht", "geopend", "klaar", "geweigerd",
//                       "verlopen"), of een ander toestel het probeerde, en bij "klaar"
//                       wat er binnenkwam (naam, documentsoort, einde van het nummer)
//   GET ?foto=voor|achter|selfie   een KLEINE voorvertoning (320 px), zodat de werker
//                       herkent of het zijn foto's zijn, maar het account nooit de volledige
//                       ID-foto's van degene met de telefoon krijgt (review N1)
//   DELETE              "klopt niet": alles van de telefoon weg; waren er al foto's, dan
//                       komt dat in het auditspoor (geen spoorloos verzamelen)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOTOS = new Set(["voor", "achter", "selfie"]);
const VOORBEELD_PX = 320;

export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({ name: "id-overdracht-start", identifier: principal.userId, limit: 15, windowSeconds: 3600 });
    const code = await maakOverdracht(principal.userId);
    return NextResponse.json({ code }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("overdracht starten mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const welke = new URL(request.url).searchParams.get("foto");
    if (welke !== null) {
      if (!FOTOS.has(welke)) throw AppError.notFound("Onbekende foto");
      await enforceRateLimit({ name: "id-overdracht-voorbeeld", identifier: principal.userId, limit: 30, windowSeconds: 3600 });
      const f = await overdrachtFoto(principal.userId, welke as "voor" | "achter" | "selfie");
      if (!f) throw AppError.notFound("Deze foto is er niet (meer).");
      // alleen een kleine voorvertoning: genoeg om je eigen foto te herkennen, te klein voor misbruik
      const klein = await cleanImage(f.bytes, VOORBEELD_PX);
      return new Response(new Uint8Array(klein.bytes), {
        status: 200,
        headers: { "Content-Type": klein.mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    const overdracht = await overdrachtStatus(principal.userId);
    const voorbeeld = overdracht?.status === "klaar" ? await overdrachtVoorbeeld(principal.userId) : null;
    return NextResponse.json({ overdracht, voorbeeld }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const { hadFotos } = await annuleerOverdracht(principal.userId);
    if (hadFotos) {
      await recordAudit({
        category: "SECURITY",
        action: "kyc.overdracht.klopt_niet",
        severity: "warning",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: "Foto's van een tweede toestel afgewezen op de laptop ('klopt niet') en gewist",
        targetType: "user",
        targetId: principal.userId,
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
