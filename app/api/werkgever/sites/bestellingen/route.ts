import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { BESTEL_STATUSSEN, bestellingenVan, zetBestelStatus, type BestelStatus } from "@/lib/sites/bestellingen";
import { siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Website → Winkel → Bestellingen: de bestellingen uit de eigen webshop (lib/sites/bestellingen.ts).

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p));
    return NextResponse.json({ bestellingen: site ? await bestellingenVan(site.id) : [] });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const statusSchema = z.object({ id: z.string().max(40), status: z.enum(BESTEL_STATUSSEN as [BestelStatus, ...BestelStatus[]]) });

// PATCH { id, status } — bevestigd, klaar, afgerond of geannuleerd.
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const input = statusSchema.parse(await request.json().catch(() => ({})));
    const bestelling = await zetBestelStatus(site.id, input.id, input.status);
    if (!bestelling) throw AppError.notFound("Deze bestelling bestaat niet.");
    return NextResponse.json({ bestelling });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
