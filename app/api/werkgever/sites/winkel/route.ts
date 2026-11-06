import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { winkelSchema } from "@/lib/sites/schema";
import { saveWinkel, winkelSiteOf } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/werkgever/sites/winkel { winkel } — Websitestudio → Producten en Instellingen:
// alleen de winkel, en die staat meteen live (lib/sites/store.ts liveSiteOf); de pagina's wachten op Publiceren.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const { winkel } = z.object({ winkel: winkelSchema }).parse(await request.json().catch(() => ({})));
    const saved = await saveWinkel(site.id, winkel);
    return NextResponse.json({ site: saved });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
