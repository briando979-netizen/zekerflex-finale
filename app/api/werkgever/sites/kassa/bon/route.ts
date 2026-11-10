import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { kassaBonMailSchema, mailKassaBon } from "@/lib/sites/kassa-server";
import { winkelSiteOf } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/sites/kassa/bon { id, email } — Webshop → Op locatie: de bon van een verkoop
// in de winkel naar de klant mailen (lib/sites/kassa-server.ts mailKassaBon). Het adres komt niet bij de verkoop.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    await enforceRateLimit({
      name: "kassa-bon",
      identifier: site.id,
      limit: 60,
      windowSeconds: 3600,
      message: "Er zijn het afgelopen uur veel bonnen gemaild. Probeer het straks opnieuw.",
    });
    const { id, email } = kassaBonMailSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await mailKassaBon(site, id, email));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
