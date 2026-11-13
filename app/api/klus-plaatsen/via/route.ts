import { NextResponse } from "next/server";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { toErrorBody } from "@/lib/errors";
import { leesVia, leesViaStap } from "@/lib/klusconcept/via";
import { telKlusVia } from "@/lib/klusconcept/via-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/klus-plaatsen/via { via: "werker", stap: "bezoek" | "concept" }: telt alleen hoe vaak /klus-plaatsen?via=werker is geopend en
// hoe vaak daar een klus is samengesteld. Een telling per maand, geen persoon, geen adres, geen cookie. Openbaar (zoals de rest van
// /api/klus-plaatsen), per bezoeker begrensd; een onbekende bron of stap wordt stil genegeerd.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "klus-via",
      identifier: privateRateLimitIdentifier(clientIp(request)),
      limit: 20,
      windowSeconds: 600,
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
