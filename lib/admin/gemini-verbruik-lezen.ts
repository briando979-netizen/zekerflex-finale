import { prisma } from "@/lib/prisma";
import { NIET_TE_LEZEN, geminiStand, maandGrenzen, telGrenzen, type GeminiStand } from "@/lib/admin/gemini-verbruik";

// ---------------------------------------------------------------------------
// Het Gemini-verbruik van deze maand uit AiUsageLog, met één kleine groupBy (per model en host, alleen de sommen; geen ruwe rijen)
// en een geheugencache van hooguit een uur (globalThis: Next bundelt routes apart). Bij een leesfout een melding in plaats van een
// kapotte pagina. Alleen rijen met de host van Google en niet van vóór TELT_VANAF (lib/admin/gemini-verbruik.ts: daarvoor
// stond bij elke rij de host van Google). De tabel heeft indexen op createdAt en (purpose, createdAt); is de query te traag,
// dan is een index op (endpointHost, createdAt) een voorstel voor 86, niets dat hier gebouwd wordt.
// ---------------------------------------------------------------------------

const TTL_MS = 60 * 60_000;
const TTL_FOUT_MS = 5 * 60_000;

const g = globalThis as unknown as { __zfGeminiVerbruik?: { maand: string; at: number; ttl: number; stand: GeminiStand } };

export async function geminiVerbruikDezeMaand(nu = new Date()): Promise<GeminiStand> {
  const { label } = maandGrenzen(nu);
  const { van, tot } = telGrenzen(nu);
  const c = g.__zfGeminiVerbruik;
  if (c && c.maand === label && nu.getTime() - c.at < c.ttl) return c.stand;
  let stand: GeminiStand;
  let ttl = TTL_MS;
  try {
    const rijen = await prisma.aiUsageLog.groupBy({
      by: ["model", "endpointHost"],
      where: {
        createdAt: { gte: van, lt: tot },
        endpointHost: { endsWith: "googleapis.com" },
      },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    });
    stand = geminiStand(
      rijen.map((r) => ({
        model: r.model,
        endpointHost: r.endpointHost,
        aanroepen: r._count._all,
        promptTokens: r._sum.promptTokens ?? 0,
        completionTokens: r._sum.completionTokens ?? 0,
        totalTokens: r._sum.totalTokens ?? 0,
      })),
      nu,
    );
  } catch {
    stand = { ok: false, melding: NIET_TE_LEZEN };
    ttl = TTL_FOUT_MS;
  }
  g.__zfGeminiVerbruik = { maand: label, at: nu.getTime(), ttl, stand };
  return stand;
}
