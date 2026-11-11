import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { leesJson } from "@/lib/afspraken/toegang";
import { KAMER_ID, bezetting, isDag, isSchoon, plusDagen } from "@/lib/kamers/model";
import { aantalTeSchonen, bewerkKamer, boekingenInPeriode, leesBoekingen, leesKamers, maakKamer, verwijderKamer, zetArchief, zetSchoon, zoekVrijeKamers } from "@/lib/kamers/store";
import { eigenOrganisatie } from "@/lib/kamers/toegang";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const geenCache = { "cache-control": "no-store" };

/** Een id uit het verzoek; alles wat geen kamer-id is, is een kamer die niet bestaat. */
function kamerId(v: unknown): string {
  if (typeof v !== "string" || !KAMER_ID.test(v)) throw AppError.notFound("Deze kamer bestaat niet (meer).");
  return v;
}

function dagParam(p: URLSearchParams, naam: string, label: string): string {
  const v = p.get(naam);
  if (!isDag(v)) throw AppError.validation(`${label} is geen geldige datum.`);
  return v;
}

/**
 * GET /api/werkgever/kamers
 * - zonder opties: kamers, boekingen die [van, tot) raken (standaard vandaag min 7 tot vandaag plus 60), vandaag en het
 *   aantal boekingen dat aan de bewaartermijn toe is;
 * - ?modus=vrij&aankomst=&vertrek=&personen=[&negeer=<boeking-id>]: de vrije kamers;
 * - ?modus=bezetting&van=&tot=: de bezetting over een periode van hoogstens 31 dagen.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const p = new URL(request.url).searchParams;
    const modus = p.get("modus");
    if (modus === "vrij") {
      const aankomst = dagParam(p, "aankomst", "De aankomstdatum");
      const vertrek = dagParam(p, "vertrek", "De vertrekdatum");
      if (vertrek <= aankomst) throw AppError.validation("De vertrekdatum moet na de aankomstdatum liggen.");
      const personen = Number(p.get("personen") ?? "1");
      if (!Number.isInteger(personen) || personen < 1 || personen > 20) throw AppError.validation("Het aantal personen moet een heel getal van 1 tot en met 20 zijn.");
      const negeer = p.get("negeer") ?? undefined;
      return NextResponse.json({ kamers: await zoekVrijeKamers(tenantId, aankomst, vertrek, personen, negeer) }, { headers: geenCache });
    }
    if (modus === "bezetting") {
      const r = bezetting((await leesKamers(tenantId)).filter((k) => !k.gearchiveerd), await leesBoekingen(tenantId), String(p.get("van")), String(p.get("tot")));
      if (!r.ok) throw AppError.validation(r.fout);
      return NextResponse.json({ bezetting: r.waarde }, { headers: geenCache });
    }
    if (modus !== null) throw AppError.validation("Onbekende modus.");
    const vandaag = amsterdamDayKey(new Date());
    const van = p.get("van") === null ? plusDagen(vandaag, -7) : dagParam(p, "van", "De begindatum");
    const tot = p.get("tot") === null ? plusDagen(vandaag, 60) : dagParam(p, "tot", "De einddatum");
    if (tot <= van) throw AppError.validation("De einddatum moet na de begindatum liggen.");
    const [kamers, boekingen, teSchonen] = await Promise.all([leesKamers(tenantId), boekingenInPeriode(tenantId, van, tot), aantalTeSchonen(tenantId)]);
    return NextResponse.json({ vandaag, kamers, boekingen, teSchonen }, { headers: geenCache });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** POST /api/werkgever/kamers: een kamer toevoegen. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const kamer = await maakKamer(tenantId, await leesJson(request));
    return NextResponse.json({ kamer }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/werkgever/kamers: { id, actie } met actie
 * - "bewerken": de gegevens van de kamer
 * - "schoon": { schoon: "schoon" | "vuil" | "in-schoonmaak" }
 * - "archiveren" (niet met een boeking die nog niet voorbij is) / "terughalen"
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    const id = kamerId(o.id);
    switch (o.actie) {
      case "bewerken":
        return NextResponse.json({ kamer: await bewerkKamer(tenantId, id, o) });
      case "schoon": {
        if (!isSchoon(o.schoon)) throw AppError.validation("Kies schoon, vuil of in schoonmaak.");
        return NextResponse.json({ kamer: await zetSchoon(tenantId, id, o.schoon) });
      }
      case "archiveren":
      case "terughalen": {
        const kamer = await zetArchief(tenantId, id, o.actie === "archiveren");
        await recordAudit({ category: "COMPANY", action: o.actie === "archiveren" ? "kamers.gearchiveerd" : "kamers.teruggehaald", actorUserId: userId, actorLabel: "user", summary: o.actie === "archiveren" ? "Kamer gearchiveerd" : "Kamer teruggehaald", targetType: "tenant", targetId: tenantId });
        return NextResponse.json({ kamer });
      }
      default:
        throw AppError.validation("Onbekende actie.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/werkgever/kamers?id=<id>: een kamer wissen, alleen zonder boekingen (anders archiveren). */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await verwijderKamer(tenantId, kamerId(new URL(request.url).searchParams.get("id")));
    await recordAudit({ category: "COMPANY", action: "kamers.gewist", actorUserId: userId, actorLabel: "user", summary: "Kamer gewist", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
