import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { PAGINA_SJABLONEN, maakSlug, normalizeInhoud, normalizeVertalingen, type Pagina, type PaginaInhoud, type Taal } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// Opslag van de eigen pagina's (lib/ontwerp/paginas.ts) in de KeyValueStore.
// Elke pagina heeft een concept (de editor bewaart daar automatisch in) en een
// live versie (pas na Publiceren). Bezoekers zien alleen live, op /p/<slug>.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:paginas";
const MAX_PAGINAS = 200;

const normalizePagina = (p: Pagina): Pagina => ({
  ...p,
  concept: normalizeInhoud(p.concept),
  live: p.live ? normalizeInhoud(p.live) : null,
  vertalingen: normalizeVertalingen(p.vertalingen),
  liveVertalingen: normalizeVertalingen(p.liveVertalingen),
});

export async function paginaLijst(): Promise<Pagina[]> {
  const lijst = (await kvGet<Pagina[]>(KEY).catch(() => null)) ?? [];
  return lijst.map(normalizePagina);
}

async function bewaar(lijst: Pagina[]) {
  await kvSet(KEY, lijst.slice(0, MAX_PAGINAS));
}

/** De live versie voor bezoekers; null als hij niet bestaat of nog nooit gepubliceerd is. */
export async function livePagina(slug: string): Promise<{ pagina: Pagina; inhoud: PaginaInhoud } | null> {
  const p = (await paginaLijst()).find((x) => x.slug === slug);
  return p?.live ? { pagina: p, inhoud: p.live } : null;
}

export async function paginaOpSlug(slug: string): Promise<Pagina | null> {
  return (await paginaLijst()).find((x) => x.slug === slug) ?? null;
}

function vrijeSlug(gewenst: string, lijst: Pagina[], behalve?: string): string {
  const basis = maakSlug(gewenst) || "pagina";
  let slug = basis;
  for (let n = 2; lijst.some((p) => p.slug === slug && p.id !== behalve); n++) slug = `${basis}-${n}`;
  return slug;
}

export async function maakPagina(titel: string, sjabloon: string, inhoud?: unknown): Promise<Pagina> {
  const lijst = await paginaLijst();
  if (lijst.length >= MAX_PAGINAS) throw AppError.validation("Er staan al 200 pagina's. Verwijder eerst een pagina die je niet meer gebruikt.");
  const basis = inhoud ? normalizeInhoud(inhoud) : (PAGINA_SJABLONEN.find((s) => s.id === sjabloon) ?? PAGINA_SJABLONEN[0]!).inhoud();
  const t = titel.trim().slice(0, 120) || basis.titel;
  const nu = new Date().toISOString();
  const pagina: Pagina = { id: `pg${randomBytes(6).toString("hex")}`, slug: vrijeSlug(t, lijst), concept: { ...basis, titel: t }, live: null, bijgewerkt: nu, gepubliceerd: null };
  await bewaar([pagina, ...lijst]);
  return pagina;
}

async function wijzig(id: string, fn: (p: Pagina, lijst: Pagina[]) => Pagina): Promise<Pagina> {
  const lijst = await paginaLijst();
  const i = lijst.findIndex((p) => p.id === id);
  const oud = lijst[i];
  if (!oud) throw AppError.validation("Deze pagina bestaat niet meer.");
  const nieuw = fn(oud, lijst);
  lijst[i] = nieuw;
  await bewaar(lijst);
  return nieuw;
}

export function bewaarConcept(id: string, inhoud: unknown): Promise<Pagina> {
  return wijzig(id, (p) => ({ ...p, concept: normalizeInhoud(inhoud), bijgewerkt: new Date().toISOString() }));
}

export function zetSlug(id: string, slug: string): Promise<Pagina> {
  return wijzig(id, (p, lijst) => ({ ...p, slug: vrijeSlug(slug, lijst, id), bijgewerkt: new Date().toISOString() }));
}

/** Het concept en al zijn vertalingen gaan samen live. */
export function publiceerPagina(id: string): Promise<Pagina> {
  return wijzig(id, (p) => ({ ...p, live: p.concept, liveVertalingen: { ...(p.vertalingen ?? {}) }, gepubliceerd: new Date().toISOString() }));
}

export function haalOffline(id: string): Promise<Pagina> {
  return wijzig(id, (p) => ({ ...p, live: null, liveVertalingen: {}, gepubliceerd: null }));
}

export function bewaarVertaling(id: string, taal: Taal, inhoud: unknown): Promise<Pagina> {
  return wijzig(id, (p) => ({ ...p, vertalingen: { ...(p.vertalingen ?? {}), [taal]: normalizeInhoud(inhoud) }, bijgewerkt: new Date().toISOString() }));
}

export function verwijderVertaling(id: string, taal: Taal): Promise<Pagina> {
  return wijzig(id, (p) => {
    const rest = { ...(p.vertalingen ?? {}) };
    delete rest[taal];
    return { ...p, vertalingen: rest, bijgewerkt: new Date().toISOString() };
  });
}

export async function verwijderPagina(id: string): Promise<void> {
  await bewaar((await paginaLijst()).filter((p) => p.id !== id));
}
