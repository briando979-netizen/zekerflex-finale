import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { controleerUitvoering, herhalingTekst } from "@/lib/checklists/model";
import { leggVast, linkHash, sjabloonVanSleutel } from "@/lib/checklists/store";
import { leesJson } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dezelfde tekst voor een sleutel die niet bestaat, is ingetrokken of van een gearchiveerde checklist: niets verklappen.
const NIET_GEVONDEN = "Deze checklist bestaat niet of staat niet open. Vraag je werkgever om een nieuwe link.";

/**
 * GET /api/checklist/<sleutel>: de taken van die ene checklist voor wie hem invult (zonder account). Openbaar (valt onder
 * /api/checklist), IP-begrensd; alleen die ene checklist, nooit andere checklists, uitvoeringen of namen. De sleutel wordt
 * nooit gelogd.
 */
export async function GET(request: Request, ctx: { params: Promise<{ sleutel: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "checklist-lezen", identifier: clientIp(request), limit: 150, windowSeconds: 600 });
    const { sleutel } = await ctx.params;
    const open = await sjabloonVanSleutel(sleutel);
    if (!open) throw AppError.notFound(NIET_GEVONDEN);
    const s = open.sjabloon;
    return NextResponse.json(
      {
        bedrijfsnaam: open.bedrijfsnaam,
        naam: s.naam,
        locatie: s.locatie,
        herhaling: herhalingTekst(s.herhaling),
        taken: s.taken.map((t) => ({ id: t.id, tekst: t.tekst, opmerkingVerplicht: t.opmerkingVerplicht })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}

/**
 * POST /api/checklist/<sleutel>: een uitvoering insturen (naam, per taak gedaan of niet, notitie). Het tijdstip is de
 * servertijd. Een verborgen veld (website) vangt bots. Met een `aanvraagId` geeft een tweede poging (dubbele tik, trage
 * verbinding) dezelfde uitvoering terug in plaats van een tweede. Antwoord: alleen de uitkomst, nooit gegevens van anderen.
 */
export async function POST(request: Request, ctx: { params: Promise<{ sleutel: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "checklist-invullen", identifier: clientIp(request), limit: 40, windowSeconds: 3600, message: "Je hebt vaak een checklist ingestuurd. Probeer het over een uur opnieuw." });
    const { sleutel } = await ctx.params;
    const open = await sjabloonVanSleutel(sleutel);
    if (!open) throw AppError.notFound(NIET_GEVONDEN);
    // ook per link begrenzen (de hash, nooit de sleutel zelf): voor het geval een link wordt misbruikt vanaf veel adressen
    await enforceRateLimit({ name: "checklist-invullen-link", identifier: linkHash(sleutel), limit: 200, windowSeconds: 3600, message: "Deze checklist is vaak ingestuurd. Probeer het over een uur opnieuw." });
    const o = await leesJson(request);
    // een mens ziet dit veld niet; een bot vult het wel in. We doen alsof het gelukt is.
    if (typeof o.website === "string" && o.website.trim()) return NextResponse.json({ uitvoering: { opgeslagen: true } });
    const r = controleerUitvoering(open.sjabloon, o);
    if (!r.ok) throw AppError.validation(r.fout);
    const aanvraagId = typeof o.aanvraagId === "string" ? o.aanvraagId : undefined;
    const { uitvoering, dubbel } = await leggVast(open.tenantId, open.sjabloon, r.waarde, { bron: "link", ...(aanvraagId !== undefined ? { aanvraagId } : {}) });
    return NextResponse.json({
      uitvoering: {
        opgeslagen: true,
        dubbel,
        compleet: uitvoering.compleet,
        tijdstip: uitvoering.tijdstip,
        aantalTaken: uitvoering.taken.length,
        aantalGedaan: uitvoering.taken.filter((t) => t.gedaan).length,
      },
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
