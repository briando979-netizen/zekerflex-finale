import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { zoekCoordinaat } from "@/lib/geo/pdok";
import { parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { afspraakVoorAdmin } from "@/lib/installatie/admin";
import { leesAfspraak, lijstAfspraken, maakAfspraak, zetStatus } from "@/lib/installatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/installaties: de afspraken met de twee links per afspraak. Alleen voor platformbeheerders. */
export async function GET(): Promise<NextResponse> {
  try {
    requireRole(await requirePrincipal(), "PLATFORM_ADMIN");
    return NextResponse.json({ afspraken: (await lijstAfspraken()).map(afspraakVoorAdmin) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const maak = z.object({
  klantNaam: z.string().trim().min(2).max(120),
  adres: z.string().trim().min(5).max(200),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  van: z.string().regex(/^\d{2}:\d{2}$/),
  tot: z.string().regex(/^\d{2}:\d{2}$/),
  monteurNaam: z.string().trim().min(2).max(80),
  regels: z.array(z.string().trim().max(120)).max(30).default([]),
  notitie: z.string().trim().max(500).default(""),
});

/** POST /api/admin/installaties: een afspraak maken. Het adres wordt opgezocht bij PDOK (gratis, Nederlands). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const p = maak.safeParse(json);
    if (!p.success) throw AppError.validation("Vul klant, adres, datum, tijden en monteur in.");
    const d = p.data;
    const plek = await zoekCoordinaat(d.adres);
    if (!plek) throw AppError.validation("Dit adres vonden we niet. Controleer straat, huisnummer en plaats.");
    const van = parseAmsterdamLocal(`${d.datum}T${d.van}`);
    const tot = parseAmsterdamLocal(`${d.datum}T${d.tot}`);
    if (Number.isNaN(van.getTime()) || Number.isNaN(tot.getTime())) throw AppError.validation("De datum of tijd klopt niet.");
    const a = await maakAfspraak({
      klantNaam: d.klantNaam,
      adres: plek.straat ? plek.naam.split(",")[0] ?? d.adres : d.adres,
      plaats: plek.plaats ?? "",
      lat: plek.lat,
      lon: plek.lon,
      venster: { van: van.toISOString(), tot: tot.toISOString() },
      monteurNaam: d.monteurNaam,
      regels: d.regels,
      notitie: d.notitie,
    });
    await recordAudit({
      category: "ADMIN",
      action: "installatie.aangemaakt",
      actorUserId: principal.userId,
      actorLabel: "admin",
      summary: `Installatieafspraak gemaakt voor ${a.klantNaam} (${a.plaats})`,
      targetType: "installatie",
      targetId: a.id,
    });
    return NextResponse.json({ afspraak: afspraakVoorAdmin(a) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const wijzig = z.object({ id: z.string().min(6).max(40), naar: z.literal("geannuleerd") });

/** PATCH /api/admin/installaties { id, naar: "geannuleerd" }: een afspraak annuleren. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const p = wijzig.safeParse(await request.json().catch(() => null));
    if (!p.success) throw AppError.validation("Dit verzoek klopt niet.");
    if (!(await leesAfspraak(p.data.id))) throw AppError.notFound("Deze afspraak bestaat niet meer.");
    const a = await zetStatus(p.data.id, p.data.naar);
    await recordAudit({
      category: "ADMIN",
      action: "installatie.geannuleerd",
      actorUserId: principal.userId,
      actorLabel: "admin",
      summary: `Installatieafspraak voor ${a.klantNaam} geannuleerd`,
      targetType: "installatie",
      targetId: a.id,
    });
    return NextResponse.json({ afspraak: afspraakVoorAdmin(a) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
