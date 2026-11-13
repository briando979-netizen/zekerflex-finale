import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { chat, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { hashVan } from "@/lib/rag/graph-layout3d";
import { benoemThemas, kiesK, ontdekThemas, synapsen, type Synaps, type Vector } from "@/lib/rag/brein-slim";

// ---------------------------------------------------------------------------
// Het slimme deel van het Brein op de server: één keer per nacht (en op verzoek)
// leest het alle embeddings uit de index en bewaart
//   brein:synapsen  — de sterkste betekenisverwanten per stuk (lib/rag/brein-slim.ts)
//   brein:ontdekt   — de thema's die het brein zelf in zijn geheugen vindt, met een naam
// Alleen stuk-id's, nummers en woorden: geen persoonsgegevens. Daarnaast de uitleg
// per cluster door het taalmodel, uitsluitend uit de echte stukken van dat cluster.
// ---------------------------------------------------------------------------

export const SYNAPSEN_SLEUTEL = "brein:synapsen";
export const ONTDEKT_SLEUTEL = "brein:ontdekt";
const PAGINA = 400;

export interface SynapsenStand {
  op: string;
  aantalStukken: number;
  paren: Synaps[];
}

export interface OntdektThema {
  id: number;
  naam: string;
  termen: string[];
  aantal: number;
}

export interface OntdektStand {
  op: string;
  aantalStukken: number;
  k: number;
  rondes: number;
  themas: OntdektThema[];
  /** per stuk-id het ontdekte thema (0-based) */
  per: Record<string, number>;
}

async function alleVectoren(): Promise<{ vectoren: Vector[]; tekst: Map<string, string> }> {
  const vectoren: Vector[] = [];
  const tekst = new Map<string, string>();
  let cursor: string | undefined;
  for (;;) {
    const rijen = await prisma.ragChunk.findMany({
      select: { id: true, embedding: true, title: true, content: true },
      orderBy: { id: "asc" },
      take: PAGINA,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const r of rijen) {
      if (r.embedding.length === 0) continue;
      vectoren.push({ id: r.id, v: r.embedding });
      tekst.set(r.id, `${r.title}\n${r.content.slice(0, 600)}`);
    }
    if (rijen.length < PAGINA) break;
    cursor = rijen[rijen.length - 1]?.id;
    if (!cursor) break;
  }
  // één dimensie: stukken met een andere vectorlengte (oud model) doen niet mee
  const dim = new Map<number, number>();
  for (const v of vectoren) dim.set(v.v.length, (dim.get(v.v.length) ?? 0) + 1);
  const meest = [...dim].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { vectoren: vectoren.filter((v) => v.v.length === meest), tekst };
}

/** Synapsen en ontdekte thema's opnieuw berekenen en bewaren; geeft de aantallen terug. Een storing gooit. */
export async function vernieuwSlim(nu: Date = new Date()): Promise<{ stukken: number; synapsen: number; themas: number; ms: number }> {
  const t0 = Date.now();
  const { vectoren, tekst } = await alleVectoren();
  const paren = await synapsen(vectoren, 4, 0.5);
  const ontdekking = await ontdekThemas(vectoren, kiesK(vectoren.length));
  const perThema: string[][] = Array.from({ length: ontdekking.k }, () => []);
  for (const [id, c] of Object.entries(ontdekking.per)) perThema[c]?.push(tekst.get(id) ?? "");
  const namen = benoemThemas(perThema.map((t) => t.join("\n")));
  const themas: OntdektThema[] = ontdekking.groottes.map((aantal, i) => ({ id: i, naam: (namen[i] ?? []).join(" · ") || `Thema ${i + 1}`, termen: namen[i] ?? [], aantal }));
  const synapsenStand: SynapsenStand = { op: nu.toISOString(), aantalStukken: vectoren.length, paren };
  const ontdektStand: OntdektStand = { op: nu.toISOString(), aantalStukken: vectoren.length, k: ontdekking.k, rondes: ontdekking.rondes, themas, per: ontdekking.per };
  await kvSet(SYNAPSEN_SLEUTEL, synapsenStand);
  await kvSet(ONTDEKT_SLEUTEL, ontdektStand);
  const ms = Date.now() - t0;
  logger.info("brein: synapsen en thema's vernieuwd", { stukken: vectoren.length, synapsen: paren.length, themas: themas.length, ms });
  return { stukken: vectoren.length, synapsen: paren.length, themas: themas.length, ms };
}

/** De bewaarde stand; null als er nog nooit is gerekend (of de opslag niet antwoordt). */
export async function leesSlim(): Promise<{ synapsen: SynapsenStand | null; ontdekt: OntdektStand | null }> {
  const [s, o] = await Promise.all([kvGet<SynapsenStand>(SYNAPSEN_SLEUTEL).catch(() => null), kvGet<OntdektStand>(ONTDEKT_SLEUTEL).catch(() => null)]);
  return {
    synapsen: s && Array.isArray(s.paren) ? s : null,
    ontdekt: o && Array.isArray(o.themas) && o.per && typeof o.per === "object" ? o : null,
  };
}

// --- uitleg per cluster ----------------------------------------------------

const UITLEG_SYSTEEM = `Je bent het geheugen van ZekerFlex. Je krijgt een reeks stukken uit één cluster van dat geheugen.
Schrijf in het Nederlands, in drie korte zinnen, wat deze stukken gemeen hebben en waar ze over gaan.
Gebruik UITSLUITEND wat in de stukken staat; verzin niets en noem geen namen van personen. Geen opsomming, geen inleiding.`;

interface UitlegGeheugen {
  per: Map<string, { op: string; tekst: string }>;
}
const g = globalThis as typeof globalThis & { __zfBreinUitleg?: UitlegGeheugen };
const uitlegGeheugen: UitlegGeheugen = (g.__zfBreinUitleg ??= { per: new Map() });

/**
 * Een uitleg van één cluster door het taalmodel, uit hooguit 24 echte stukken (vaste, deterministische keuze), per
 * versie van de gegevens in het geheugen. Zonder model of bij een storing een eerlijke melding, nooit een verzinsel.
 */
export async function clusterUitleg(clusterId: string, stukIds: readonly string[], versie: string): Promise<{ tekst: string; stukken: number; bron: "model" | "geen-model" | "storing" }> {
  const sleutel = `${clusterId}|${versie}`;
  const c = uitlegGeheugen.per.get(sleutel);
  if (c) return { tekst: c.tekst, stukken: Math.min(24, stukIds.length), bron: "model" };
  if (stukIds.length === 0) return { tekst: "Dit cluster heeft geen stukken.", stukken: 0, bron: "geen-model" };
  const keuze = [...stukIds].sort((a, b) => hashVan(a) - hashVan(b)).slice(0, 24);
  if (llmConfigProblem()) return { tekst: "Er is nu geen taalmodel beschikbaar om dit cluster uit te leggen; de stukken zelf staan in het geheugen.", stukken: keuze.length, bron: "geen-model" };
  const rijen = await prisma.ragChunk.findMany({ where: { id: { in: keuze } }, select: { id: true, title: true, content: true } });
  const context = rijen.map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 320)}`).join("\n\n");
  try {
    const { text } = await chat({
      purpose: "brein-uitleg",
      model: fastModel(),
      temperature: 0.2,
      maxTokens: 260,
      timeoutMs: 45_000,
      retry: false,
      messages: [
        { role: "system", content: UITLEG_SYSTEEM },
        { role: "user", content: `STUKKEN:\n${context}` },
      ],
    });
    const tekst = text.trim();
    if (!tekst) throw new Error("leeg antwoord");
    uitlegGeheugen.per.set(sleutel, { op: new Date().toISOString(), tekst });
    return { tekst, stukken: rijen.length, bron: "model" };
  } catch (err) {
    logger.warn("brein-uitleg mislukt", { soort: err instanceof Error ? err.name : "onbekend" });
    return { tekst: "Het taalmodel antwoordde niet op tijd. Probeer het zo nog eens.", stukken: rijen.length, bron: "storing" };
  }
}
