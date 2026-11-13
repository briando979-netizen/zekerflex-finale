import { NextResponse } from "next/server";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { toErrorBody } from "@/lib/errors";
import { leesVia, leesViaStap } from "@/lib/klusconcept/via";
import { telKlusVia } from "@/lib/klusconcept/via-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eén bezoeker is hoogstens twee tellingen (bezoek en concept), dus tien per adres per dag is ruim. Met de oude grens
// (20 per 10 minuten) kon één script de maandtelling met ±2.900 per dag per adres opblazen (veiligheidsronde 13 nov).
// Boven de grens een 429, nooit een 403 (CrowdSec telt 403-reeksen als inbraakpoging).
const LIMIET_PER_DAG = 10;
const DAG_SECONDEN = 86_400;

// POST /api/klus-plaatsen/via { via: "werker", stap: "bezoek" | "concept" }: telt alleen hoe vaak /klus-plaatsen?via=werker is geopend en
// hoe vaak daar een klus is samengesteld. Een telling per maand, geen persoon, geen adres, geen cookie. Openbaar (zoals de rest van
// /api/klus-plaatsen), per bezoeker begrensd; een onbekende bron of stap wordt stil genegeerd.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "klus-via",
      identifier: privateRateLimitIdentifier(clientIp(request)),
      limit: LIMIET_PER_DAG,
      windowSeconds: DAG_SECONDEN,
      message: "Te veel verzoeken. Probeer het later opnieuw.",
    });
    const body = (await request.json().catch(() => ({}))) as { via?: unknown; stap?: unknown };
    const via = leesVia(body.via);
    const stap = leesViaStap(body.stap);
    if (via && stap) await telKlusVia(stap).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
