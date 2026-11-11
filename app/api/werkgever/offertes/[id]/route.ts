import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { OFFERTE_ID, controleerInhoud, naarBeheer } from "@/lib/offertes/model";
import { bewerkOfferte, kopieerOfferte, leesOfferte, nieuweLinkOfferte, trekOfferteIn, verstuurOfferte, verwijderOfferte, wisKlant } from "@/lib/offertes/store";
import { eigenOrganisatie, leesJson } from "@/lib/offertes/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function geldigId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!OFFERTE_ID.test(id)) throw AppError.notFound("Deze offerte bestaat niet (meer).");
  return id;
}

/** GET /api/werkgever/offertes/<id>: één offerte. */
export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const o = await leesOfferte(tenantId, await geldigId(ctx));
    if (!o) throw AppError.notFound("Deze offerte bestaat niet (meer).");
    return NextResponse.json({ offerte: naarBeheer(o, new Date()) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** PUT /api/werkgever/offertes/<id>: een concept bewerken. Een verstuurde of beantwoorde offerte geeft 409 met uitleg. */
export async function PUT(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "offertes-bewerken", identifier: userId, limit: 600, windowSeconds: 3600 });
    const id = await geldigId(ctx);
    const nu = new Date();
    const r = controleerInhoud(await leesJson(request), nu);
    if (!r.ok) throw AppError.validation(r.fout);
    return NextResponse.json({ offerte: naarBeheer(await bewerkOfferte(tenantId, id, r.waarde, nu), nu) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/werkgever/offertes/<id>: alleen een concept. */
export async function DELETE(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const id = await geldigId(ctx);
    const o = await leesOfferte(tenantId, id);
    await verwijderOfferte(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "offerte.verwijderd", actorUserId: userId, actorLabel: "user", summary: `Concept-offerte ${o?.nummer ?? ""} verwijderd`.trim(), targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const ACTIES = ["versturen", "nieuwe-link", "intrekken", "kopie", "klant-wissen"] as const;
type Actie = (typeof ACTIES)[number];

/**
 * POST /api/werkgever/offertes/<id> met { actie }:
 *   versturen     concept → verstuurd; antwoord bevat `token` (de link voor de klant, alleen nu te zien)
 *   nieuwe-link   een verstuurde offerte een nieuwe link geven; de oude is ongeldig; antwoord bevat `token`
 *   intrekken     verstuurd → concept; de link werkt niet meer
 *   kopie         een nieuwe versie als concept met een nieuw nummer
 *   klant-wissen  de klantgegevens wissen (gegevens van een derde) en de link ongeldig maken
 * Er wordt niets gemaild: het bedrijf stuurt de link zelf.
 */
export async function POST(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "offertes-acties", identifier: userId, limit: 300, windowSeconds: 3600 });
    const id = await geldigId(ctx);
    const o = await leesJson(request);
    const actie = ACTIES.find((a) => a === o.actie) as Actie | undefined;
    if (!actie) throw AppError.validation("Onbekende actie.");
    const nu = new Date();
    const audit = (action: string, summary: string) => recordAudit({ category: "COMPANY", action, actorUserId: userId, actorLabel: "user", summary, targetType: "tenant", targetId: tenantId });

    if (actie === "versturen") {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      const r = await verstuurOfferte(tenantId, id, tenant?.name ?? "Bedrijf", nu);
      await audit("offerte.verstuurd", `Offerte ${r.offerte.nummer} klaargezet met een link`);
      return NextResponse.json({ offerte: naarBeheer(r.offerte, nu), token: r.token });
    }
    if (actie === "nieuwe-link") {
      const r = await nieuweLinkOfferte(tenantId, id, nu);
      await audit("offerte.nieuwe-link", `Nieuwe link voor offerte ${r.offerte.nummer}`);
      return NextResponse.json({ offerte: naarBeheer(r.offerte, nu), token: r.token });
    }
    if (actie === "intrekken") {
      const n = await trekOfferteIn(tenantId, id, nu);
      await audit("offerte.ingetrokken", `Offerte ${n.nummer} ingetrokken`);
      return NextResponse.json({ offerte: naarBeheer(n, nu) });
    }
    if (actie === "kopie") {
      const n = await kopieerOfferte(tenantId, id, nu);
      await audit("offerte.kopie", `Offerte ${n.nummer} gemaakt als kopie van ${n.kopieVan ?? "een andere offerte"}`);
      return NextResponse.json({ offerte: naarBeheer(n, nu) });
    }
    const n = await wisKlant(tenantId, id, nu);
    await audit("offerte.klant-gewist", `Klantgegevens van offerte ${n.nummer} gewist`);
    return NextResponse.json({ offerte: naarBeheer(n, nu) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
