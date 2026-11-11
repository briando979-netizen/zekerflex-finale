import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { afsprakenVanKlant, bewaarNotitie, klantenLijst, verwijderKlant } from "@/lib/afspraken/store";
import { eigenOrganisatie, leesJson } from "@/lib/afspraken/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een klantsleutel zoals klantSleutel() hem maakt: "e-<e-mailadres>" of "t-<cijfers>". Alles anders is geen klant. */
const geldigeSleutel = (s: unknown): s is string => typeof s === "string" && s.length <= 140 && /^(e-[^\s@]+@[^\s@]+\.[^\s@]{2,}|t-\d{6,16})$/.test(s);

/** GET /api/werkgever/klanten: { klanten, afgekapt }; met ?klant=<sleutel> in plaats daarvan { afspraken, afgekapt } van die klant. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const klant = new URL(request.url).searchParams.get("klant");
    if (klant !== null) {
      if (!geldigeSleutel(klant)) throw AppError.notFound("Deze klant bestaat niet (meer).");
      return NextResponse.json(await afsprakenVanKlant(tenantId, klant));
    }
    // `afgekapt: true` = er zijn meer afspraken dan in één lijst passen; het scherm zegt dat de lijst niet compleet is
    return NextResponse.json(await klantenLijst(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** PUT /api/werkgever/klanten: de notitie bij een klant bewaren (leeg wist hem). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const o = await leesJson(request);
    if (!geldigeSleutel(o.sleutel)) throw AppError.validation("Deze klant is niet te vinden.");
    await bewaarNotitie(tenantId, o.sleutel, typeof o.notitie === "string" ? o.notitie : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/werkgever/klanten?klant=<sleutel>: een klant helemaal wissen (naam, nummer, adres en notitie overal weg). */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const klant = new URL(request.url).searchParams.get("klant");
    if (!geldigeSleutel(klant)) throw AppError.validation("Deze klant is niet te vinden.");
    const aantal = await verwijderKlant(tenantId, klant);
    // alleen het aantal in het auditspoor, nooit wie het was
    await recordAudit({ category: "COMPANY", action: "klant.gewist", actorUserId: userId, actorLabel: "user", summary: `Klantgegevens gewist uit ${aantal} afspra${aantal === 1 ? "ak" : "ken"}`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ gewist: aantal });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
