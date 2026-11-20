import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getZoeklocatie, setZoeklocatie } from "@/lib/worker/zoeklocatie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/zoeklocatie: de plaats van het startscherm "Waar wil je klussen doen?", of null. */
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    return NextResponse.json({ zoeklocatie: await getZoeklocatie(principal.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/me/zoeklocatie  { lat, lng, label }
 * De coördinaat komt uit de plaatszoeker (/api/geo/search) of uit de huidige locatie van het toestel (met het adres
 * uit /api/geo/reverse als naam). Buiten Nederland of zonder naam: een fout, er wordt niets bewaard.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const plek = await setZoeklocatie(principal.userId, json);
    if (!plek) throw AppError.validation("Kies een plaats in Nederland.").metSleutel("zoeklocatie.ongeldig");
    return NextResponse.json({ zoeklocatie: plek });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
