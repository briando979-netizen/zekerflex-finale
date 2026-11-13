import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { kvListEntries, kvSet } from "@/lib/storage/kv";
import { smartChunk } from "@/lib/rag/smart-chunk";
import { embedMany, isRagEnabled } from "@/lib/rag/embed";
import { search, upsertChunk } from "@/lib/rag/store";

// ---------------------------------------------------------------------------
// "Voed het brein" (Admin → Kennisgraaf, Brein): een beheerder typt kennis in, het
// stuk wordt meteen in het geheugen opgenomen (RagChunk, bron INTERACTION, sourceRef
// voeding:<id>) en het brein zegt met welke bestaande stukken het verwant is (echte
// cosinus over de index). De tekst zelf staat ook in de KV (`brein:voeding:<id>`),
// zodat de nachtelijke herindexering (lib/rag/reindex.ts, indexInteractions) hem
// opnieuw opneemt in plaats van weggooit: dezelfde sourceRef, titel en stukjes geven
// dezelfde contentHash. Alleen PLATFORM_ADMIN, via de route; geen persoonsgegevens
// behalve wie het invoerde (het account van de beheerder).
// ---------------------------------------------------------------------------

export const VOEDING_PREFIX = "brein:voeding:";
export const VOEDING_MIN = 20;
export const VOEDING_MAX = 4000;

export interface Voeding {
  id: string;
  titel: string;
  tekst: string;
  op: string;
  /** het account (id) van de beheerder die het invoerde */
  door: string;
  /** de stukken waarmee het brein het verbond, sterkste eerst */
  buren: string[];
}

export interface VoedingBuur {
  id: string;
  title: string;
  sourceType: string;
  sourceRef: string;
  score: number;
}

/** De titel van een voeding: de eerste zin of regel, hooguit 80 tekens. */
export function voedingTitel(tekst: string): string {
  const eerste = tekst.trim().split(/\r?\n/)[0]?.trim() ?? "";
  const m = /^(.*?[.!?])(?:\s|$)/.exec(eerste);
  const zin = m?.[1] ?? eerste;
  const t = (zin || eerste).replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t || "Zonder titel";
}

/** Zoals de herindexering de voeding ziet: één invoer per stuk kennis. */
export function voedingEntries(lijst: readonly Voeding[]): { sourceRef: string; title: string; text: string }[] {
  return lijst.map((v) => ({ sourceRef: `voeding:${v.id}`, title: v.titel, text: v.tekst }));
}

/** Alle voedingen, oudste eerst (een storing geeft een lege lijst). */
export async function voedingLijst(): Promise<Voeding[]> {
  const rijen = await kvListEntries<Voeding>(VOEDING_PREFIX, 2000).catch(() => []);
  return rijen
    .map((r) => r.value)
    .filter((v): v is Voeding => Boolean(v && typeof v.id === "string" && typeof v.tekst === "string"))
    .sort((a, b) => a.op.localeCompare(b.op));
}

function nieuwId(nu: Date): string {
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, "0");
  return `${nu.getTime().toString(36)}${rand}`;
}

/**
 * Neemt de tekst op in het geheugen en geeft terug welke stukken erbij kwamen en met welke bestaande stukken ze verwant zijn.
 * Gooit AppError.validation bij te korte of te lange tekst, of als het geheugenmodel uit staat.
 */
export async function voedBrein(ruw: string, door: string, nu: Date = new Date()): Promise<{ voeding: Voeding; chunkIds: string[]; buren: VoedingBuur[] }> {
  const tekst = ruw.replace(/\r\n/g, "\n").trim();
  if (tekst.length < VOEDING_MIN) throw AppError.validation(`Typ minstens ${VOEDING_MIN} tekens: een hele gedachte, geen los woord.`);
  if (tekst.length > VOEDING_MAX) throw AppError.validation(`Houd het onder de ${VOEDING_MAX} tekens; splits het anders in twee keer voeden.`);
  if (!isRagEnabled()) throw AppError.validation("Het geheugenmodel staat uit; zonder embeddings kan het brein niets opnemen.");
  const titel = voedingTitel(tekst);
  const id = nieuwId(nu);
  const sourceRef = `voeding:${id}`;
  const stukken = smartChunk(tekst, { title: titel }).map((c) => c.text);
  if (stukken.length === 0) throw AppError.validation("Daar kon het brein geen stuk kennis van maken.");
  const vectoren = await embedMany(stukken);
  for (let i = 0; i < stukken.length; i++) {
    const embedding = vectoren[i];
    if (!embedding) continue;
    await upsertChunk({ sourceType: "INTERACTION", sourceRef, title: titel, chunkIndex: i, content: stukken[i]!, embedding });
  }
  const eerste = vectoren[0];
  const buren: VoedingBuur[] = eerste
    ? (await search(eerste, { limit: 10, minScore: 0.2 }))
        .filter((h) => h.sourceRef !== sourceRef)
        .slice(0, 8)
        .map((h) => ({ id: h.id, title: h.title, sourceType: h.sourceType, sourceRef: h.sourceRef, score: Math.round(h.score * 1000) / 1000 }))
    : [];
  const voeding: Voeding = { id, titel, tekst, op: nu.toISOString(), door, buren: buren.map((b) => b.id) };
  await kvSet(`${VOEDING_PREFIX}${id}`, voeding);
  const rijen = await prisma.ragChunk.findMany({ where: { sourceRef }, select: { id: true }, orderBy: { chunkIndex: "asc" } });
  return { voeding, chunkIds: rijen.map((r) => r.id), buren };
}
