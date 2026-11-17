import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { campagneFouten, type CampagnePagina } from "@/lib/campagne/pagina";
import { bewaarCampagnePagina, campagnePagina, verwijderCampagnePagina } from "@/lib/campagne/pagina-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/campagnes: een campagnepagina opslaan (nieuw of bijwerken); DELETE: weghalen.
// Strikt platformbeheer. De regels (adres, knop, foto, geen valse beloftes) staan in lib/campagne/pagina.ts.
const invoer = z.object({
  slug: z.string().trim().max(60),
  doelgroep: z.enum(["werker", "bedrijf"]),
  kop: z.string().trim().max(60),
  kopAccent: z.string().trim().max(60),
  tekst: z.string().trim().max(400),
  punten: z.array(z.string().trim().max(80)).max(6),
  knopTekst: z.string().trim().max(60),
  knopDoel: z.string().trim().max(40),
  foto: z.string().trim().max(80),
  aan: z.boolean(),
});

const lees = async (request: Request) =>
  request.json().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
  });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const input = invoer.parse(await lees(request));
  const pagina = { ...input, punten: input.punten.filter((p) => p.length > 0) };
  const fouten = campagneFouten(pagina);
  if (fouten.length > 0) throw AppError.validation(fouten[0] ?? "De pagina klopt nog niet.");
  const opgeslagen: CampagnePagina = { ...pagina, bijgewerkt: new Date().toISOString() };
  await bewaarCampagnePagina(opgeslagen);
  return NextResponse.json({ pagina: opgeslagen });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const { slug } = z.object({ slug: z.string().trim().max(60) }).parse(await lees(request));
  if (!(await campagnePagina(slug))) throw AppError.notFound("Deze campagnepagina bestaat niet (meer).");
  await verwijderCampagnePagina(slug);
  return NextResponse.json({ weg: true });
});
