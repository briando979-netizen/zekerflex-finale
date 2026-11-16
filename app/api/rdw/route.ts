import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normaliseerKenteken } from "@/lib/ritten/model";
import { rdwOmschrijving } from "@/lib/integrations/rdw";
import { rdwVoertuig } from "@/lib/integrations/rdw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/rdw?kenteken=AB-12-CD — de openbare gegevens van een kenteken bij de RDW (lib/integrations/rdw*.ts), om een
// voertuig in te vullen. Alleen ingelogd en begrensd per gebruiker: geen openbare kentekenzoeker van ons maken.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "rdw-kenteken", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met kentekens opzoeken; probeer het zo opnieuw." });
    const kenteken = normaliseerKenteken(new URL(request.url).searchParams.get("kenteken"));
    const v = await rdwVoertuig(kenteken);
    if (!v) throw AppError.notFound("De RDW kent dit kenteken niet. Controleer het kenteken.");
    return NextResponse.json({ voertuig: v, omschrijving: rdwOmschrijving(v) }, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}
