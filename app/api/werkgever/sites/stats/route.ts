import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { siteTenantOf, soortVan } from "@/lib/sites/access";
import { siteStats } from "@/lib/sites/stats";
import { siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

// GET /api/werkgever/sites/stats?dagen=30 — the visitor figures of my company's website
// (lib/sites/stats.ts): counters per day, nothing about individual visitors.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p), soortVan(request));
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const asked = Number(new URL(request.url).searchParams.get("dagen"));
    const dagen = RANGES.find((r) => r === asked) ?? 30;
    const stats = await siteStats(site.id, dagen).catch((err: unknown) => {
      logger.warn("site stats unavailable", { siteId: site.id, err: String(err) });
      return null;
    });
    if (!stats) {
      return NextResponse.json({ error: { code: "UNAVAILABLE", message: "De bezoekerscijfers zijn even niet beschikbaar. Probeer het straks opnieuw." } }, { status: 503 });
    }
    return NextResponse.json({ dagen, stats, pages: site.pages.map((pg) => ({ slug: pg.slug, titel: pg.titel })) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
