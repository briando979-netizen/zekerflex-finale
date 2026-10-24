import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { SITE } from "@/lib/seo";
import { pingIndexNow } from "@/lib/seo/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dagelijks de belangrijkste publieke URL's bij IndexNow (Bing/Yandex) melden,
// zodat ze net zo snel geïndexeerd raken als bij Google. No-op zonder INDEXNOW_KEY.
const PATHS = [
  "/", "/voor-bedrijven", "/voor-freelancers", "/prijzen", "/klussen",
  "/open-diensten", "/shop", "/uitzendbureau", "/kennis", "/over-ons", "/app",
];

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const result = await pingIndexNow(PATHS.map((p) => `${SITE.url}${p}`));
    recordCronRun("indexnow", result.ok);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("indexnow", false);
    logger.error("indexnow ping failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "IndexNow failed" } }, { status: 500 });
  }
}

export const GET = handle;
