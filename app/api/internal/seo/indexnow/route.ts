import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { SITE } from "@/lib/seo";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { bingDienBatchIn } from "@/lib/seo/bing-webmaster";
import sitemap from "@/app/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dagelijks de belangrijkste publieke URL's bij IndexNow (Bing/Yandex) melden,
// zodat ze net zo snel geïndexeerd raken als bij Google. No-op zonder INDEXNOW_KEY.
const PATHS = [
  "/", "/voor-bedrijven", "/voor-freelancers", "/prijzen", "/klussen",
  "/open-diensten", "/shop", "/uitzendbureau", "/kennis", "/over-ons", "/app",
  "/rekentools", "/rekentools/zzp-uurtarief-berekenen", "/rekentools/kosten-uitzendkracht-berekenen", "/rekentools/wet-dba-check",
];

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const result = await pingIndexNow(PATHS.map((p) => `${SITE.url}${p}`));
    recordCronRun("indexnow", result.ok);

    // Daarnaast een ronde sitemap-URL's rechtstreeks bij Bing indienen (naast IndexNow), binnen het dagquotum en met
    // omloop zodat de hele site langskomt. Faalt stil en doet niets zonder Bing-sleutel (lib/seo/bing-webmaster.ts).
    let bing = { ingediend: 0, ok: false, reden: "overgeslagen" as string | undefined };
    try {
      const regels = await sitemap();
      bing = await bingDienBatchIn(regels.map((r) => r.url));
    } catch (err) {
      logger.warn("bing submit skipped", { error: (err as Error).message });
    }
    recordCronRun("bing-indienen", bing.ok || bing.reden === "geen sleutel");

    return NextResponse.json({ indexnow: result, bing });
  } catch (err) {
    recordCronRun("indexnow", false);
    logger.error("indexnow ping failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "IndexNow failed" } }, { status: 500 });
  }
}

export const GET = handle;
