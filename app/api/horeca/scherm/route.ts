import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { isSchermRol } from "@/lib/horeca/schermen";
import { lees, schermActieSchema } from "@/lib/horeca/schema";
import { schermContext, voerUit } from "@/lib/horeca/scherm-server";
import { schermDataVan } from "@/lib/horeca/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De schermen van het horeca-pakket (/scherm/<rol>): keuken, bar, uitgifte,
// bediening, ontvangst, afhaal en live-overzicht. Openbaar in de zin van
// lib/auth/public-routes.ts, maar alleen voor een gekoppeld apparaat (eigen
// ondertekend cookie, lib/horeca/apparaten.ts) of de beheerder van de zaak.
// GET ?rol= → de gegevens van dat scherm; POST { rol, actie, … } → één actie,
// daarna de verse gegevens terug.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const rolUit = (s: unknown) => {
  if (!isSchermRol(s)) throw AppError.validation("Onbekend scherm.");
  return s;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const rol = rolUit(new URL(request.url).searchParams.get("rol"));
    const ctx = await schermContext(rol);
    return NextResponse.json({ rol, apparaat: ctx.apparaat ? { naam: ctx.apparaat.naam } : null, ...(await schermDataVan(ctx.zaak, rol)) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const body: unknown = await request.json().catch(() => null);
    const rol = rolUit((body as { rol?: unknown } | null)?.rol);
    const ctx = await schermContext(rol);
    const uit = await voerUit(ctx, rol, lees(schermActieSchema, body));
    return NextResponse.json({ rol, apparaat: ctx.apparaat ? { naam: ctx.apparaat.naam } : null, ...(await schermDataVan(ctx.zaak, rol)), ...(uit.bonnen ? { bonnen: uit.bonnen } : {}) });
  } catch (err) {
    return fout(err);
  }
}
