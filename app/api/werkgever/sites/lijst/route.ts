import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SECTOR_TEMPLATES } from "@/lib/sites/types";
import { WEBSHOP_TEMPLATES } from "@/lib/sites/webshop-templates";
import { createSchema } from "@/lib/sites/schema";
import { companyDefaults, siteTenantOf } from "@/lib/sites/access";
import { kiesSite, maakExtraSite, sitesVanTenant } from "@/lib/sites/meer-sites";
import { MAX_SITES_PER_SOORT } from "@/lib/sites/meer-sites-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Alle sites van mijn bedrijf (lib/sites/meer-sites.ts), voor het overzicht in de Studio.
// GET                       → de sites, de startpunten per soort en het maximum
// POST {actie:"kies", id}   → die site openen in de Studio
// POST {actie:"maak", …}    → nog een website of webshop maken (de bestaande blijft)
// Alleen de beheerder van het bedrijf (zelfde regel als de bouwer: lib/sites/access.ts).
// ---------------------------------------------------------------------------

const kort = (t: { id: string; naam: string }) => ({ id: t.id, naam: t.naam });

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    return NextResponse.json({ sites: await sitesVanTenant(tenantId), max: MAX_SITES_PER_SOORT, startpunten: { website: SECTOR_TEMPLATES.map(kort), webshop: WEBSHOP_TEMPLATES.map(kort) } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("kies"), id: z.string().max(40) }),
  z.object({ actie: z.literal("maak"), soort: z.enum(["website", "webshop"]), templateId: z.string().max(40), naam: z.string().trim().min(1).max(100) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dat konden we niet lezen. Probeer het opnieuw.");
    const d = parsed.data;
    if (d.actie === "kies") {
      const site = await kiesSite(tenantId, d.id, { userId: p.userId });
      return NextResponse.json({ site, sites: await sitesVanTenant(tenantId) });
    }
    await enforceRateLimit({ name: "site-extra", identifier: p.userId, limit: 10, windowSeconds: 86_400, message: "Je hebt vandaag al veel sites gemaakt; probeer het morgen opnieuw." });
    // de gegevens van het bedrijf zoals we ze kennen, met de naam die de beheerder voor deze site kiest
    const bedrijf = { ...(await companyDefaults(tenantId, p)), naam: d.naam };
    const input = createSchema.parse({ templateId: d.templateId, soort: d.soort, bedrijf });
    const nieuw = await maakExtraSite(tenantId, { userId: p.userId, name: p.fullName }, input);
    return NextResponse.json({ site: { id: nieuw.id, soort: d.soort, slug: nieuw.slug }, sites: await sitesVanTenant(tenantId) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
