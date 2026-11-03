import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { siteOfTenant } from "@/lib/sites/store";
import { koppelZekerflexProduct, zekerflexCatalogus } from "@/lib/sites/zekerflex-producten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Website → Winkel → "Uit de ZekerFlex-webshop": de catalogus, en één product naar de eigen winkel kopiëren.

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await siteTenantOf(p);
    return NextResponse.json({ producten: await zekerflexCatalogus() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST { id } — het product met zijn foto klaarzetten; de bouwer voegt het toe aan de winkel en bewaart.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const { id } = z.object({ id: z.string().min(1).max(60) }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await koppelZekerflexProduct(site.id, id), { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
