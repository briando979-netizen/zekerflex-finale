import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { runAfter } from "@/lib/run-after";
import { DAG_SLEUTEL, controleerKlant, laatsteDag, openDagen, schoneTekst, vrijeTijden } from "@/lib/afspraken/model";
import { stuurBevestiging } from "@/lib/afspraken/mail";
import { meldBedrijf } from "@/lib/afspraken/melding";
import { afsprakenVanDag, boek, openInstellingenVanSlug } from "@/lib/afspraken/store";
import { leesJson } from "@/lib/afspraken/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIET_GEVONDEN = "Deze boekpagina bestaat niet of staat niet open.";

/**
 * GET /api/boeken/<slug>: de openbare gegevens van de boekpagina (bedrijfsnaam, diensten, medewerkers). Met
 * ?dienst=<id>&dag=YYYY-MM-DD[&medewerker=<id>] de vrije tijden van die dag. Openbaar (valt onder /api/boeken), IP-begrensd;
 * alleen wat een klant nodig heeft: nooit de afspraken of klanten van het bedrijf.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "boeken-lezen", identifier: clientIp(request), limit: 150, windowSeconds: 600 });
    const { slug } = await ctx.params;
    const open = await openInstellingenVanSlug(slug);
    if (!open) throw AppError.notFound(NIET_GEVONDEN);
    const i = open.instellingen;
    const q = new URL(request.url).searchParams;
    const dienst = q.get("dienst");
    const dag = q.get("dag");
    if (dienst !== null || dag !== null) {
      if (!dienst || !dag || !DAG_SLEUTEL.test(dag)) throw AppError.validation("Kies een dienst en een dag.");
      const medewerker = q.get("medewerker");
      const afspraken = await afsprakenVanDag(open.tenantId, dag);
      const tijden = vrijeTijden(i, { dienstId: dienst, medewerkerId: medewerker || null, dag, afspraken, nu: new Date() });
      // een klant ziet alleen de tijden; wie er bij hoort, regelt de server bij het boeken
      return NextResponse.json({ tijden: tijden.map((s) => s.start) });
    }
    const nu = new Date();
    return NextResponse.json(
      {
        bedrijfsnaam: i.bedrijfsnaam,
        diensten: i.diensten.map((d) => ({ id: d.id, naam: d.naam, duurMin: d.duurMin, prijsCent: d.prijsCent })),
        medewerkers: i.medewerkers.map((m) => ({ id: m.id, naam: m.naam })),
        // weekdagnummers (0 = zondag) met minstens één tijdvak; de andere dagen zijn gesloten en niet te kiezen
        openDagen: openDagen(i),
        vanDag: amsterdamDayKey(nu),
        totDag: laatsteDag(nu, i.maxDagenVooruit),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/boeken/<slug>: een afspraak boeken. De server controleert zelf of de tijd vrij is. Een verborgen veld
 * (website) vangt bots; zonder toestemming (het bedrijf mag de gegevens gebruiken om de afspraak te regelen) wordt niets bewaard.
 * Antwoord: alleen wat de klant zelf net invulde en de tijd; nooit de gegevens van andere klanten.
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "boeken-boeken", identifier: clientIp(request), limit: 8, windowSeconds: 3600, message: "Je hebt vaak geboekt. Probeer het over een uur opnieuw of bel het bedrijf." });
    const { slug } = await ctx.params;
    const open = await openInstellingenVanSlug(slug);
    if (!open) throw AppError.notFound(NIET_GEVONDEN);
    const o = await leesJson(request);
    // een mens ziet dit veld niet; een bot vult het wel in. We doen alsof het gelukt is.
    if (typeof o.website === "string" && o.website.trim()) return NextResponse.json({ afspraak: { bevestigd: true } });
    if (o.toestemming !== true) throw AppError.validation("Zet een vinkje om te bevestigen dat het bedrijf je gegevens mag gebruiken voor deze afspraak.");
    const klant = controleerKlant({ naam: (o.klant as Record<string, unknown> | undefined)?.naam, telefoon: (o.klant as Record<string, unknown> | undefined)?.telefoon, email: (o.klant as Record<string, unknown> | undefined)?.email });
    if (!klant.ok) throw AppError.validation(klant.fout);
    const start = typeof o.start === "string" ? new Date(o.start) : new Date(Number.NaN);
    if (Number.isNaN(start.getTime()) || !/Z$/.test(String(o.start))) throw AppError.validation("Kies een tijd uit de lijst.");
    const i = open.instellingen;
    const dienstId = String(o.dienstId ?? "");
    let medewerkerId = typeof o.medewerkerId === "string" ? o.medewerkerId : "";
    const nu = new Date();
    if (!medewerkerId) {
      // geen voorkeur: de eerste medewerker die op die tijd vrij is
      const dag = amsterdamDayKey(start);
      const vrij = vrijeTijden(i, { dienstId, medewerkerId: null, dag, afspraken: await afsprakenVanDag(open.tenantId, dag), nu }).find((s) => s.start === start.toISOString());
      if (!vrij) throw AppError.conflict("Deze tijd is niet meer beschikbaar. Kies een andere tijd.");
      medewerkerId = vrij.medewerkerId;
    }
    const a = await boek(open.tenantId, i, { dienstId, medewerkerId, start, klant: klant.waarde, opmerking: schoneTekst(o.opmerking, 300), bron: "online" }, nu);
    // het bedrijf hoort het meteen (push, anders een mail); na het antwoord, en een mislukte melding raakt het boeken nooit
    runAfter(() => meldBedrijf(open.tenantId, a, "geboekt"));
    // en de klant krijgt een bevestiging met een link om te annuleren, alleen als hij een e-mailadres invulde (het
    // toestemmingsvinkje dekt "mij daarover te bereiken"); het antwoord hieronder bevat de link nooit
    if (a.klant.email) runAfter(() => stuurBevestiging(open.tenantId, a, i, nu));
    return NextResponse.json({ afspraak: { bevestigd: true, bedrijfsnaam: i.bedrijfsnaam, dienstNaam: a.dienstNaam, medewerkerNaam: a.medewerkerNaam, start: a.start, eind: a.eind, duurMin: a.duurMin } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
