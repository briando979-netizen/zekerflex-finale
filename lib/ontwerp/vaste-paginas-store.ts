import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { isStandaardPaginaIndeling, isVastePagina, normalizePaginaIndeling, type PaginaIndeling, type VastePaginaId } from "@/lib/ontwerp/vaste-paginas";

// ---------------------------------------------------------------------------
// Opslag van de indeling van de vaste pagina's (lib/ontwerp/vaste-paginas.ts): één sleutel met per pagina de eigen indeling.
// Geen eigen indeling (of de opslag is even weg) = null: de pagina toont dan de oorspronkelijke volgorde.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:vaste-paginas";
type Alles = Partial<Record<VastePaginaId, PaginaIndeling>>;

async function lees(): Promise<Alles> {
  const raw = await kvGet<Record<string, unknown>>(KEY).catch(() => null);
  const uit: Alles = {};
  if (!raw || typeof raw !== "object") return uit;
  for (const [pagina, indeling] of Object.entries(raw)) if (isVastePagina(pagina)) uit[pagina] = normalizePaginaIndeling(pagina, indeling);
  return uit;
}

export async function getPaginaIndeling(pagina: VastePaginaId): Promise<PaginaIndeling | null> {
  return (await lees())[pagina] ?? null;
}

/** Alle eigen indelingen (voor de ontwerper). */
export async function getPaginaIndelingen(): Promise<Alles> {
  return lees();
}

async function bewaar(alles: Alles): Promise<void> {
  if (Object.keys(alles).length === 0) await kvDelete(KEY);
  else await kvSet(KEY, alles);
}

/** Gelijk aan de standaard = de eigen versie van die pagina weg (dan blijft de pagina exact zoals hij was). */
export async function setPaginaIndeling(pagina: VastePaginaId, raw: unknown): Promise<PaginaIndeling | null> {
  const i = normalizePaginaIndeling(pagina, raw);
  const alles = await lees();
  if (isStandaardPaginaIndeling(pagina, i)) delete alles[pagina];
  else alles[pagina] = i;
  await bewaar(alles);
  return alles[pagina] ?? null;
}

export async function resetPaginaIndeling(pagina: VastePaginaId): Promise<void> {
  const alles = await lees();
  delete alles[pagina];
  await bewaar(alles);
}
