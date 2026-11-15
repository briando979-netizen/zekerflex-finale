import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { verwerkVoorraadLink } from "@/lib/shop/voorraadmelding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/shop/voorraadmelding/afmelden — de knop op /shop/voorraadmelding?actie=af (lib/shop/voorraadmelding.ts). Een
// POST en geen GET: een linkscanner van een mailprogramma mag niemand afmelden. Een foute handtekening geeft 404, geen 403.

const schema = z.object({ v: z.string().min(1).max(40), a: z.string().min(1).max(40), s: z.string().min(1).max(64) });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "shop-voorraadmelding-af", identifier: clientIp(req), limit: 30, windowSeconds: 3600 });
    const d = schema.safeParse(await req.json().catch(() => null));
    if (!d.success) throw AppError.notFound("Deze link klopt niet.");
    const uit = await verwerkVoorraadLink("af", d.data.v, d.data.a, d.data.s);
    if (!uit.ok) throw AppError.notFound("Deze link klopt niet.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
