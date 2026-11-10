import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { kassaVandaag, kassaVerkoopSchema, verkoopInWinkel } from "@/lib/sites/kassa-server";
import { winkelSiteOf } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webshop → Op locatie (components/studio/Kassa.tsx, lib/sites/kassa-server.ts):
//   GET  — wat er vandaag in de winkel is verkocht, per betaalwijze
//   POST { regels, methode, ontvangenCents? } — een verkoop afronden: bestelling (kanaal winkel),
//        voorraad omlaag, en de bon terug

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    return NextResponse.json({ vandaag: await kassaVandaag(site.id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const invoer = kassaVerkoopSchema.parse(await request.json().catch(() => ({})));
    const { bestelling, bon } = await verkoopInWinkel(site, invoer);
    return NextResponse.json({ bon, bestelling: { id: bestelling.id, nr: bestelling.nr }, vandaag: await kassaVandaag(site.id).catch(() => null) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
