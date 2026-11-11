import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { amsterdamDayKey, parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { DAG_SLEUTEL, beginInstellingen, controleerInstellingen, laatsteDag, schoneEmail, schoneTelefoon, schoneTekst } from "@/lib/afspraken/model";
import { magKlantMailen } from "@/lib/afspraken/mail";
import { afsprakenTussen, bewaarInstellingen, boek, leesInstellingen, nieuwId } from "@/lib/afspraken/store";
import { eigenOrganisatie, leesJson } from "@/lib/afspraken/toegang";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/werkgever/afspraken?van=YYYY-MM-DD&tot=YYYY-MM-DD: de instellingen en de afspraken in een periode (standaard
 * vandaag en de zes dagen erna, hooguit 62 dagen). Zonder instellingen krijg je een beginopzet, nog niet bewaard.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const q = new URL(request.url).searchParams;
    const nu = new Date();
    const vandaag = amsterdamDayKey(nu);
    const van = DAG_SLEUTEL.test(q.get("van") ?? "") ? (q.get("van") as string) : vandaag;
    let tot = DAG_SLEUTEL.test(q.get("tot") ?? "") ? (q.get("tot") as string) : laatsteDag(nu, 6);
    if (tot < van) tot = van;
    const maxTot = new Date(Date.UTC(Number(van.slice(0, 4)), Number(van.slice(5, 7)) - 1, Number(van.slice(8, 10)) + 62)).toISOString().slice(0, 10);
    if (tot > maxTot) tot = maxTot;
    let instellingen = await leesInstellingen(tenantId);
    let nieuw = false;
    if (!instellingen) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      instellingen = beginInstellingen(tenant?.name ?? "Mijn bedrijf", nieuwId);
      nieuw = true;
    }
    // mailt dit bedrijf zijn klanten al? Alleen een geverifieerd bedrijf (het scherm legt het uit)
    return NextResponse.json({ instellingen, nieuw, vandaag, van, tot, mailAan: await magKlantMailen(tenantId), afspraken: await afsprakenTussen(tenantId, van, tot) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** PUT /api/werkgever/afspraken: de instellingen opslaan (diensten, medewerkers, openingstijden, boekadres). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "afspraken-instellingen", identifier: userId, limit: 60, windowSeconds: 3600, message: "Je hebt de instellingen vaak aangepast. Probeer het over een uur opnieuw." });
    const r = controleerInstellingen(await leesJson(request), nieuwId);
    if (!r.ok) throw AppError.validation(r.fout);
    await bewaarInstellingen(tenantId, r.waarde);
    await recordAudit({ category: "COMPANY", action: "afspraken.instellingen", actorUserId: userId, actorLabel: "user", summary: `Afsprakeninstellingen bewaard (${r.waarde.actief ? "boekpagina open" : "boekpagina dicht"})`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ instellingen: r.waarde });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/werkgever/afspraken: zelf een afspraak maken, bijvoorbeeld na een telefoontje of aan de balie. De tijd komt als
 * Nederlandse klokkentijd ("2026-11-12T09:30"); de voorlooptijd telt niet, wel dezelfde controle op bezette tijden.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "afspraken-balie", identifier: userId, limit: 300, windowSeconds: 3600 });
    const o = await leesJson(request);
    const i = await leesInstellingen(tenantId);
    if (!i) throw AppError.validation("Stel eerst je diensten, medewerkers en openingstijden in.");
    const start = typeof o.start === "string" ? parseAmsterdamLocal(o.start) : new Date(Number.NaN);
    if (Number.isNaN(start.getTime())) throw AppError.validation("Kies een geldige datum en tijd.");
    const k = (o.klant && typeof o.klant === "object" ? o.klant : {}) as Record<string, unknown>;
    const naam = schoneTekst(k.naam, 80);
    if (naam.length < 2) throw AppError.validation("Vul de naam van de klant in.");
    const a = await boek(
      tenantId,
      i,
      { dienstId: String(o.dienstId ?? ""), medewerkerId: String(o.medewerkerId ?? ""), start, klant: { naam, telefoon: schoneTelefoon(k.telefoon), email: schoneEmail(k.email) }, opmerking: schoneTekst(o.opmerking, 300), bron: "balie" },
      new Date(),
    );
    return NextResponse.json({ afspraak: a });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
