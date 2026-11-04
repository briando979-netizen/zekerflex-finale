import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { FetchError } from "@/lib/website-check/fetch";
import { runWebsiteCheck } from "@/lib/website-check/run";
import { registreerWebsiteCheck } from "@/lib/scans/registreer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ url: z.string().trim().min(3).max(500) });

// POST /api/website-check — gratis check van een openbare website. Per bezoeker
// en in totaal begrensd: elke check doet ~25 verzoeken naar die site, dus dit
// mag nooit een manier worden om anderen te bestoken.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "website-check",
      identifier: clientIp(request),
      limit: 6,
      windowSeconds: 600,
      message: "Je hebt net een paar checks gedaan. Probeer het over tien minuten opnieuw.",
    });
    await enforceRateLimit({
      name: "website-check-day",
      identifier: "all",
      limit: 400,
      windowSeconds: 86_400,
      message: "Het is vandaag erg druk met website-checks. Probeer het morgen opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Vul het adres van je website in.");

    const result = await runWebsiteCheck(parsed.data.url);
    void recordServerEvent({ path: "/website-check", label: "website-check", meta: { host: result.host, score: result.score } });
    // in het scanlogboek, met een voorstel op maat en (op de achtergrond) een lead (lib/scans)
    const { dealId } = await registreerWebsiteCheck(result);
    return NextResponse.json({ ok: true, result, dealId });
  } catch (err) {
    if (err instanceof FetchError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 422 });
    }
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website check failed", { error: (err as Error).message });
    return res;
  }
}
