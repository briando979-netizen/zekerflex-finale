import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { reindexAll } from "@/lib/rag/reindex";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { K_STATUS, uitrolHoudtModelStil, type LiveStatus } from "@/lib/bouwer/live";
import { HERKANSING_KV, besluit, nieuweHerkansing, type Herkansing } from "@/lib/rag/herkansing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron entrypoint: rebuild the local RAG index (codebase, audit, legal, sales,
// platform state, interactions). Run every ~12h.
// Tijdens een uitrol niet (lib/rag/herkansing.ts): dan een herkansing over ±30 min, die de cron
// "*/15 … ?herkansing=1" ophaalt. Geen fout in het logboek; een waarschuwing alleen als ook de herkansing faalt.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  const herkansingRun = new URL(request.url).searchParams.get("herkansing") === "1";
  const nu = Date.now();
  const uitrolBezig = async () => uitrolHoudtModelStil(await kvGet<LiveStatus>(K_STATUS).catch(() => null), Date.now());
  const herkansing = await kvGet<Herkansing>(HERKANSING_KV).catch(() => null);

  const stap = besluit({ herkansingRun, uitrolBezig: await uitrolBezig(), herkansing, nu });
  if (stap === "niets") return NextResponse.json({ ok: true, overgeslagen: "geen herkansing aan de beurt" });
  if (stap === "uitstellen") {
    await kvSet(HERKANSING_KV, nieuweHerkansing(nu, herkansingRun && herkansing ? herkansing.uitstel + 1 : 0)).catch(() => undefined);
    logger.info("rag reindex: uitrol bezig, herkansing over 30 min", { herkansing: herkansingRun });
    return NextResponse.json({ ok: true, overgeslagen: "uitrol bezig" });
  }

  try {
    const result = await reindexAll({ stil: true });
    const mislukt = result.mislukt ?? [];
    if (mislukt.length === 0) {
      if (herkansing) await kvDelete(HERKANSING_KV).catch(() => undefined);
    } else if (herkansingRun) {
      // ook de herkansing faalde: één waarschuwing, en niet nog eens
      await kvDelete(HERKANSING_KV).catch(() => undefined);
      logger.warn("rag reindex: ook de herkansing faalde", { indexers: mislukt.map((m) => m.indexer).join(","), fout: mislukt[0]?.fout });
    } else if (await uitrolBezig()) {
      // een uitrol begon halverwege: geen fout, een herkansing
      await kvSet(HERKANSING_KV, nieuweHerkansing(Date.now())).catch(() => undefined);
      logger.info("rag reindex: uitrol tijdens de run, herkansing over 30 min", { indexers: mislukt.map((m) => m.indexer).join(",") });
    } else {
      for (const m of mislukt) logger.error("rag indexer failed", { indexer: m.indexer, error: m.fout });
    }
    recordCronRun("rag-reindex", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("rag-reindex", false);
    logger.error("rag reindex failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: (err as Error).message } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
