import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { leesJson } from "@/lib/afspraken/toegang";
import { ARTIKEL_ID } from "@/lib/voorraad/model";
import { bewerkArtikel, geschiedenis, leesArtikelen, maakArtikel, muteer, verwijderArtikel, zetArchief } from "@/lib/voorraad/store";
import { eigenOrganisatie } from "@/lib/voorraad/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const geenCache = { "cache-control": "no-store" };

/** Een id uit het verzoek; alles wat geen artikel-id is, is een artikel dat niet bestaat. */
function artikelId(v: unknown): string {
  if (typeof v !== "string" || !ARTIKEL_ID.test(v)) throw AppError.notFound("Dit artikel bestaat niet (meer).");
  return v;
}

/** GET /api/werkgever/voorraad: alle artikelen (ook gearchiveerde, met een vlag); met ?artikel=<id> de laatste 100 mutaties. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const id = new URL(request.url).searchParams.get("artikel");
    if (id !== null) return NextResponse.json({ mutaties: await geschiedenis(tenantId, artikelId(id)) }, { headers: geenCache });
    return NextResponse.json({ artikelen: await leesArtikelen(tenantId) }, { headers: geenCache });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** POST /api/werkgever/voorraad: een artikel toevoegen (met een beginaantal). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const artikel = await maakArtikel(tenantId, await leesJson(request));
    return NextResponse.json({ artikel }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/werkgever/voorraad: { id, actie } met actie
 * - "mutatie": { reden, hoeveelheid, opmerking } (ook de telling: reden "telling" met het getelde aantal)
 * - "bewerken": de gegevens van het artikel (niet het aantal)
 * - "archiveren" / "terughalen"
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    const id = artikelId(o.id);
    switch (o.actie) {
      case "mutatie": {
        const { artikel, mutatie } = await muteer(tenantId, id, o, userId);
        // alleen een telling in het auditspoor (het logboek van het artikel houdt de rest bij); nooit een naam of e-mail
        if (mutatie.reden === "telling") await recordAudit({ category: "COMPANY", action: "voorraad.telling", actorUserId: userId, actorLabel: "user", summary: "Voorraad geteld", targetType: "tenant", targetId: tenantId });
        return NextResponse.json({ artikel, mutatie });
      }
      case "bewerken":
        return NextResponse.json({ artikel: await bewerkArtikel(tenantId, id, o) });
      case "archiveren":
      case "terughalen": {
        const artikel = await zetArchief(tenantId, id, o.actie === "archiveren");
        await recordAudit({ category: "COMPANY", action: o.actie === "archiveren" ? "voorraad.gearchiveerd" : "voorraad.teruggehaald", actorUserId: userId, actorLabel: "user", summary: o.actie === "archiveren" ? "Artikel gearchiveerd" : "Artikel teruggehaald", targetType: "tenant", targetId: tenantId });
        return NextResponse.json({ artikel });
      }
      default:
        throw AppError.validation("Onbekende actie.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/werkgever/voorraad?id=<id>: een artikel wissen, alleen zonder mutaties (anders archiveren). */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const id = artikelId(new URL(request.url).searchParams.get("id"));
    await verwijderArtikel(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "voorraad.gewist", actorUserId: userId, actorLabel: "user", summary: "Artikel gewist", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
