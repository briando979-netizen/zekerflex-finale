import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { annuleerOverdracht, maakOverdracht, overdrachtFoto, overdrachtStatus, overdrachtVoorbeeld } from "@/lib/kyc/overdracht";

// "Verder op je telefoon" (lib/kyc/overdracht.ts), de kant van de laptop. Alleen
// de eigen overdracht (achter de login):
//   POST                eenmalige code voor de QR-code (20 min)
//   GET                 hoe het staat ("wacht", "geopend", "klaar", "geweigerd",
//                       "verlopen"), of een ander toestel het probeerde, en bij "klaar"
//                       wat er binnenkwam (naam, documentsoort, einde van het nummer)
//   GET ?foto=voor|achter|selfie   één foto, zodat de werker eerst controleert
//   DELETE              "klopt niet": alles van de telefoon weg
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOTOS = new Set(["voor", "achter", "selfie"]);

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
      const f = await overdrachtFoto(principal.userId, welke as "voor" | "achter" | "selfie");
      if (!f) throw AppError.notFound("Deze foto is er niet (meer).");
      return new Response(new Uint8Array(f.bytes), {
        status: 200,
        headers: { "Content-Type": f.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
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
    await annuleerOverdracht(principal.userId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
