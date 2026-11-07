import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { chat, embed } from "@/lib/ai/client";
import { gratisAan, gratisModel, primeGratis } from "@/lib/ai/gratis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Houdt het eigen taalmodel en het kennisbankmodel in het geheugen (cron elke
// 4 minuten). Wordt het model afgeschoten (bijvoorbeeld door geheugendruk
// tijdens een uitrol), dan laadt deze tik het opnieuw, zodat een gast niet 25
// seconden op het laden wacht. Alleen met "alles gratis" aan: anders zou elke
// tik tegoed bij de betaalde aanbieder kosten.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  await primeGratis();
  if (!gratisAan()) return NextResponse.json({ ok: true, overgeslagen: "alles gratis staat uit" });
  const t0 = Date.now();
  try {
    await Promise.all([
      chat({ purpose: "ai-warm", messages: [{ role: "user", content: "Zeg alleen: ok" }], maxTokens: 1, retry: false, timeoutMs: 120_000 }),
      embed("ok"),
    ]);
    recordCronRun("ai-warm", true);
    return NextResponse.json({ ok: true, model: gratisModel("main"), ms: Date.now() - t0 });
  } catch (err) {
    recordCronRun("ai-warm", false);
    logger.warn("ai warm houden mislukt", { error: (err as Error).message, ms: Date.now() - t0 });
    return NextResponse.json({ ok: false, ms: Date.now() - t0 }, { status: 200 });
  }
}

export const GET = handle;
export const POST = handle;
