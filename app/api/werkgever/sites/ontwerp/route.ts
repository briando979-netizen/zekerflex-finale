import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { siteTenantOf, soortVan } from "@/lib/sites/access";
import { maakOngedaan, pasOntwerpToe, zoalsOpgeslagen, type OntwerpWissel } from "@/lib/sites/ontwerp-wissel";
import { ontwerpVoor, opzetVoor } from "@/lib/sites/ontwerpen";
import { siteSaveSchema } from "@/lib/sites/schema";
import { saveSite, siteOfTenant } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Studio → Ontwerpen: een ander ontwerp gebruiken op de site van het bedrijf
// (lib/sites/ontwerp-wissel.ts), en de laatste wissel ongedaan maken.
// Het concept verandert; bezoekers zien het na Publiceren, zoals elke wijziging.
//   KV "site-ontwerp-vorig:<siteId>" — de laatste wissel (één stap terug)
// ---------------------------------------------------------------------------

const wisselKey = (siteId: string) => `site-ontwerp-vorig:${siteId}`;
const nieuwId = () => `b${randomBytes(8).toString("hex").slice(0, 8)}`;

const kies = z.object({
  ontwerpId: z.string().max(40),
  /** ook de ontbrekende pagina's en blokken van het ontwerp erbij */
  paginas: z.boolean().optional(),
});

/** Wat het scherm van de laatste wissel moet weten. */
const vorigeVan = (w: OntwerpWissel | null) => (w ? { ontwerpId: w.ontwerpId, naam: w.naam, at: w.at } : null);

async function eigenSite(request: Request) {
  const p = await requirePrincipal();
  const site = await siteOfTenant(await siteTenantOf(p), soortVan(request));
  return { p, site };
}

/** Bewaar via het gewone opslaan, met dezelfde controles als de bouwer (schema, foto's van deze site). */
const bewaar = (site: SiteDoc) => saveSite(site.id, siteSaveSchema.parse({ theme: site.theme, bedrijf: site.bedrijf, pages: site.pages }));

// GET /api/werkgever/sites/ontwerp[?soort=webshop] — de laatste wissel die nog ongedaan kan, of null.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { site } = await eigenSite(request);
    return NextResponse.json({ vorige: site ? vorigeVan(await kvGet<OntwerpWissel>(wisselKey(site.id))) : null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST — gebruik dit ontwerp: { ontwerpId, paginas? }.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { p, site } = await eigenSite(request);
    if (!site) throw AppError.notFound("Maak eerst een website of webshop.");
    const input = kies.parse(await request.json().catch(() => ({})));
    const ontwerp = ontwerpVoor(site.soort ?? "website", input.ontwerpId);
    if (!ontwerp) throw AppError.notFound("Dit ontwerp bestaat niet (meer).");
    const opzet = input.paginas ? opzetVoor(ontwerp, site.bedrijf, nieuwId) : null;
    const { site: nieuw, wissel } = pasOntwerpToe(site, ontwerp, opzet, new Date().toISOString());
    const saved = await bewaar(nieuw);
    const vast = zoalsOpgeslagen(wissel, saved.pages);
    await kvSet(wisselKey(site.id), vast);
    await recordAudit({
      category: "SALES",
      action: "site.design-changed",
      actorUserId: p.userId,
      summary: `Ontwerp ${ontwerp.naam} gekozen voor ${site.slug}${opzet ? `, met ${vast.paginas.length} pagina's en ${vast.blokken.length} blokken erbij` : ""}`,
      targetType: "site",
      targetId: site.id,
    });
    return NextResponse.json({ site: saved, vorige: vorigeVan(vast), erbij: { paginas: vast.paginas.length, blokken: vast.blokken.length } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE — de laatste wissel ongedaan maken.
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { p, site } = await eigenSite(request);
    if (!site) throw AppError.notFound("Maak eerst een website of webshop.");
    const wissel = await kvGet<OntwerpWissel>(wisselKey(site.id));
    if (!wissel) throw AppError.notFound("Er is geen ontwerpwissel om ongedaan te maken.");
    const { site: terug, bleven } = maakOngedaan(site, wissel);
    const saved = await bewaar(terug);
    await kvDelete(wisselKey(site.id));
    await recordAudit({ category: "SALES", action: "site.design-undone", actorUserId: p.userId, summary: `Ontwerp ${wissel.naam} ongedaan gemaakt voor ${site.slug}`, targetType: "site", targetId: site.id });
    return NextResponse.json({ site: saved, bleven });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
