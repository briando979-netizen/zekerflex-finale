import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { kiesStijl } from "@/lib/website-check/nieuwe-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ checkId: z.string().regex(/^[a-f0-9]{16}$/), stijl: z.string().max(20), palet: z.string().max(20) });

// POST /api/website-check/website/stijl — meer opties: een andere stijl of kleuren voor de nieuwe
// website van een gratis check. Alleen voor de voorbeeldsite van die check (lib/website-check/nieuwe-site.ts
// kiesStijl); per bezoeker begrensd, want elke keuze publiceert de voorbeeldsite opnieuw.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "website-check-stijl",
      identifier: clientIp(request),
      limit: 30,
      windowSeconds: 3600,
      message: "Je hebt al veel stijlen geprobeerd. Probeer het over een uur opnieuw.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Kies een stijl en een kleur.");
    const site = await kiesStijl(parsed.data.checkId, parsed.data.stijl, parsed.data.palet);
    void recordServerEvent({ path: "/website-check", label: "website-check-stijl", meta: { stijl: parsed.data.stijl, palet: parsed.data.palet } });
    return NextResponse.json({ ok: true, site });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website check style failed", { error: (err as Error).message });
    return res;
  }
}
