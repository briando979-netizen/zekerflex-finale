import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { leesJson } from "@/lib/afspraken/toegang";
import { LM_ID, vandaagVan } from "@/lib/lidmaatschappen/model";
import { bewerkLid, bewerkVorm, leesLeden, leesLidmaatschappen, leesVormen, logboek, maakLid, maakLidmaatschap, maakVorm, registreerBezoek, wijzigLidmaatschap, wisLid, zetVormArchief } from "@/lib/lidmaatschappen/store";
import { eigenOrganisatie } from "@/lib/lidmaatschappen/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const geenCache = { "cache-control": "no-store" };

/** Een id uit het verzoek; alles wat geen id is (ook "constructor" uit een URL), is iets dat niet bestaat. */
function geldigId(v: unknown, wat: string): string {
  if (typeof v !== "string" || !LM_ID.test(v)) throw AppError.notFound(`${wat} bestaat niet (meer).`);
  return v;
}

/** GET /api/werkgever/lidmaatschappen: vormen, leden en lidmaatschappen; met ?lid=<id> de laatste 100 bezoeken van dat lid. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const lid = new URL(request.url).searchParams.get("lid");
    if (lid !== null) return NextResponse.json({ bezoeken: await logboek(tenantId, geldigId(lid, "Dit lid")) }, { headers: geenCache });
    const [vormen, leden, lidmaatschappen] = await Promise.all([leesVormen(tenantId), leesLeden(tenantId), leesLidmaatschappen(tenantId)]);
    return NextResponse.json({ vandaag: vandaagVan(new Date()), vormen, leden, lidmaatschappen }, { headers: geenCache });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** POST /api/werkgever/lidmaatschappen: { type: "vorm" | "lid" | "lidmaatschap" | "bezoek", ... } */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    switch (o.type) {
      case "vorm":
        return NextResponse.json({ vorm: await maakVorm(tenantId, o) }, { status: 201 });
      case "lid":
        return NextResponse.json({ lid: await maakLid(tenantId, o) }, { status: 201 });
      case "lidmaatschap":
        return NextResponse.json({ lidmaatschap: await maakLidmaatschap(tenantId, o) }, { status: 201 });
      case "bezoek":
        return NextResponse.json(await registreerBezoek(tenantId, geldigId(o.lidId, "Dit lid"), o, userId), { status: 201 });
      default:
        throw AppError.validation("Onbekend soort gegeven.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/werkgever/lidmaatschappen: { type, id, actie } met
 * - type "vorm": actie "bewerken" | "archiveren" | "terughalen"
 * - type "lid": actie "bewerken" | "wissen" (naam, telefoon, e-mail en notitie weg)
 * - type "lidmaatschap": actie "pauzeren" | "hervatten" | "beeindigen" (met datum en reden)
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    if (o.type === "vorm") {
      const id = geldigId(o.id, "Deze vorm");
      if (o.actie === "bewerken") return NextResponse.json({ vorm: await bewerkVorm(tenantId, id, o) });
      if (o.actie === "archiveren" || o.actie === "terughalen") return NextResponse.json({ vorm: await zetVormArchief(tenantId, id, o.actie === "archiveren") });
    } else if (o.type === "lid") {
      const id = geldigId(o.id, "Dit lid");
      if (o.actie === "bewerken") return NextResponse.json({ lid: await bewerkLid(tenantId, id, o) });
      if (o.actie === "wissen") {
        const lid = await wisLid(tenantId, id);
        // geen naam of e-mail in het auditspoor: alleen dat er gewist is
        await recordAudit({ category: "COMPANY", action: "lidmaatschappen.lid_gewist", actorUserId: userId, actorLabel: "user", summary: "Gegevens van een lid gewist", targetType: "tenant", targetId: tenantId });
        return NextResponse.json({ lid });
      }
    } else if (o.type === "lidmaatschap") {
      const id = geldigId(o.id, "Dit lidmaatschap");
      if (o.actie === "pauzeren" || o.actie === "hervatten" || o.actie === "beeindigen") {
        return NextResponse.json({ lidmaatschap: await wijzigLidmaatschap(tenantId, id, { actie: o.actie, datum: o.datum, reden: o.reden }) });
      }
    }
    throw AppError.validation("Onbekende actie.");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
