import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { isDatum, plusDagen } from "@/lib/horeca/reserveren";
import { siteTenantOf } from "@/lib/sites/access";
import { datumTekst, nuInNL, reserveerBlokVan } from "@/lib/sites/reserveren";
import { RESERVEER_STATUSSEN, maakReservering, reserveringenVan, zetReserveerStatus, type ReserveerStatus } from "@/lib/sites/reserveringen-opslag";
import { reserveerMailGast } from "@/lib/sites/reserveringen";
import { siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Websitestudio → Reserveringen: de tafels die via de eigen website zijn gereserveerd (lib/sites/reserveringen-opslag.ts),
// en wat de zaak zelf invoert (een gast die belt). GET ?van=&tot= (hoogstens 62 dagen), POST = zelf invoeren, PATCH = status.

async function eigenSite() {
  const p = await requirePrincipal();
  const site = await siteOfTenant(await siteTenantOf(p));
  if (!site) throw AppError.notFound("Maak eerst een website.");
  return site;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const site = await eigenSite();
    const q = new URL(request.url).searchParams;
    const vandaag = nuInNL().datum;
    const van = isDatum(q.get("van")) ? (q.get("van") as string) : vandaag;
    const totGevraagd = isDatum(q.get("tot")) ? (q.get("tot") as string) : van;
    const tot = totGevraagd < van ? van : totGevraagd > plusDagen(van, 61) ? plusDagen(van, 61) : totGevraagd;
    // het blok staat in de pagina's; aan = de gepubliceerde of de bewerkte site heeft het
    return NextResponse.json({ reserveringen: await reserveringenVan(site.id, van, tot), van, tot, vandaag, aan: Boolean(reserveerBlokVan(site.pages)) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const nieuwSchema = z.object({
  datum: z.string().refine(isDatum, "Kies een dag."),
  tijd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Kies een tijd, bijvoorbeeld 19:00."),
  personen: z.number().int().min(1, "Met hoeveel personen?").max(500),
  naam: z.string().trim().min(1, "Vul een naam in.").max(100),
  email: z.string().trim().max(200).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Dit e-mailadres klopt niet."),
  telefoon: z.string().trim().max(30),
  opmerking: z.string().trim().max(600),
});

// POST { datum, tijd, personen, naam, email, telefoon, opmerking } — de zaak voert zelf in (mag overboeken).
// Met een e-mailadres krijgt de gast dezelfde bevestiging als online.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const site = await eigenSite();
    const blok = reserveerBlokVan(site.pages);
    if (!blok) throw AppError.validation("Zet eerst het blok Tafel reserveren op je website (Website → blok toevoegen).");
    const r = nieuwSchema.parse(await request.json().catch(() => ({})));
    const uit = await maakReservering(site.id, blok, r, "beheer");
    if ("fouten" in uit) throw AppError.validation(uit.fouten.join(" "));
    if (r.email) {
      await sendMail({ to: r.email, ...(site.bedrijf.email ? { replyTo: site.bedrijf.email } : {}), kind: "site-reservering-gast", subject: `Je reservering bij ${site.bedrijf.naam}: ${datumTekst(r.datum)} om ${r.tijd}`, text: reserveerMailGast(uit.rec, site.bedrijf) }).catch((err) =>
        logger.warn("site reservation guest mail failed", { siteId: site.id, err: String(err) }),
      );
    }
    return NextResponse.json({ reservering: uit.rec }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const statusSchema = z.object({ id: z.string().max(40), status: z.enum(RESERVEER_STATUSSEN as [ReserveerStatus, ...ReserveerStatus[]]) });

// PATCH { id, status } — aangekomen, niet gekomen, geannuleerd, of terug naar bevestigd.
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const site = await eigenSite();
    const input = statusSchema.parse(await request.json().catch(() => ({})));
    const reservering = await zetReserveerStatus(site.id, input.id, input.status);
    if (!reservering) throw AppError.notFound("Deze reservering bestaat niet.");
    return NextResponse.json({ reservering });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
