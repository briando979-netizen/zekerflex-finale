import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { maakNieuweSite } from "@/lib/website-check/nieuwe-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const schema = z.object({ checkId: z.string().regex(/^[a-f0-9]{16}$/) });

// POST /api/website-check/website — "Maak mijn nieuwe website": van een gecheckte
// site een nieuwe in de stijl van schwarzwald.zekerflex.com (lib/website-check/nieuwe-site.ts).
// Per bezoeker en per dag begrensd: elke nieuwe site haalt de pagina, het logo en
// tot acht foto's op en kost opslag.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "website-check-site",
      identifier: clientIp(request),
      limit: 3,
      windowSeconds: 3600,
      message: "Je hebt net een paar nieuwe websites laten maken. Probeer het over een uur opnieuw.",
    });
    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Doe eerst de check van je website.");
    // pas na de controle tellen: alleen echte aanvragen gaan van het dagbudget af
    await enforceRateLimit({
      name: "website-check-site-day",
      identifier: "all",
      limit: 25,
      windowSeconds: 86_400,
      message: "Vandaag zijn er al veel nieuwe websites gemaakt. Probeer het morgen opnieuw, of laat hieronder je gegevens achter.",
    });
    const { check, site } = await maakNieuweSite(parsed.data.checkId);
    void recordServerEvent({ path: "/website-check", label: "website-check-site", meta: { host: check.host, score: site.score ?? 0 } });
    return NextResponse.json({ ok: true, site });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website check new site failed", { error: (err as Error).message });
    return res;
  }
}
