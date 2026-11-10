import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bewaarWieBenJij, leesWieBenJij } from "@/lib/onboarding/wie-ben-jij-opslag";
import { OPLEIDING_NIVEAUS, OPLEIDING_RICHTINGEN } from "@/lib/onboarding/opleiding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: wat er van stap 1 ("Hey! Wie ben jij?") al bewaard is. PUT: bewaren.
// Alle regels (18+, telefoon in E.164, naam die vaststaat) staan in lib/onboarding/wie-ben-jij*.ts.

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    return NextResponse.json(await leesWieBenJij(p.userId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  voornaam: z.string().trim().max(60),
  achternaam: z.string().trim().max(80),
  geboortedatum: z.string().trim().max(10),
  landnummer: z.string().trim().max(5),
  telefoon: z.string().trim().max(30),
  // optioneel; null wist de keuze
  opleiding: z
    .object({ niveau: z.enum(OPLEIDING_NIVEAUS), richting: z.enum(OPLEIDING_RICHTINGEN).optional() })
    .nullable()
    .optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "wie-ben-jij", identifier: p.userId, limit: 30, windowSeconds: 3600 });
    const json = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens.");
    const { opleiding, ...rest } = parsed.data;
    const stand = await bewaarWieBenJij(p.userId, {
      ...rest,
      ...(opleiding === undefined ? {} : { opleiding: opleiding === null ? null : opleiding.richting ? { niveau: opleiding.niveau, richting: opleiding.richting } : { niveau: opleiding.niveau } }),
    });
    return NextResponse.json(stand);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
