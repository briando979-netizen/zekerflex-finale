import { gratisAan, primeGratis } from "@/lib/ai/gratis";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { KEUZE_DIENSTEN, STANDAARD_KEUZE, type Bron, type KeuzeDienst } from "@/lib/gratis/keuze-soorten";

// ---------------------------------------------------------------------------
// Per dienst kiezen welke bron hij pakt. De grote knop "alles gratis"
// (lib/ai/gratis.ts) is alles-of-niets en zet óók de AI op ons eigen, kleinere
// model — daardoor durf je hem niet aan terwijl je de betaalde kaart- en
// bedrijvenbron wél meteen kwijt wilt. Hier staat per dienst een eigen keuze:
//
//   "eigen"    altijd onze eigen bron, nooit de betaalde. Kost gegarandeerd niets.
//   "betaald"  eerst de betaalde dienst, onze eigen bron als terugval
//              (en ook als de sleutel ontbreekt).
//   "auto"     onze eigen bron zodra "alles gratis" aanstaat of er geen sleutel
//              is; anders de betaalde.
//
// Net als de grote knop: in KV, zonder uitrol te wijzigen, met een cache van
// een minuut zodat een synchrone lezer hem kan zien. De soorten en de teksten
// staan apart in lib/gratis/keuze-soorten.ts, zodat een scherm ze mag inlezen
// zonder kv mee te slepen.
// ---------------------------------------------------------------------------

const KEY = "gratis:keuzes";
const TTL_MS = 60_000;

export type { Bron, KeuzeDienst } from "@/lib/gratis/keuze-soorten";

const isBron = (v: unknown): v is Bron => v === "eigen" || v === "betaald" || v === "auto";

function lees(raw: unknown): Record<KeuzeDienst, Bron> {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const uit = { ...STANDAARD_KEUZE };
  for (const id of KEUZE_DIENSTEN) {
    const v = r[id];
    if (isBron(v)) uit[id] = v;
  }
  return uit;
}

let cache: { v: Record<KeuzeDienst, Bron>; at: number } = { v: { ...STANDAARD_KEUZE }, at: 0 };

/** Sync: de keuze voor één dienst (standaard als er nog nooit iets gekozen is). */
export const keuzeVoor = (id: KeuzeDienst): Bron => cache.v[id];

/** Async: ververs de keuzes uit KV (goedkoop, 60 s). */
export async function primeKeuzes(): Promise<void> {
  if (cache.at > 0 && Date.now() - cache.at < TTL_MS) return;
  try {
    cache = { v: lees(await kvGet<unknown>(KEY)), at: Date.now() };
  } catch {
    cache = { v: cache.v, at: Date.now() }; // opslag even weg → laatste waarde houden
  }
}

export async function getKeuzes(): Promise<Record<KeuzeDienst, Bron>> {
  await primeKeuzes();
  return { ...cache.v };
}

export async function setKeuze(id: KeuzeDienst, bron: Bron): Promise<Record<KeuzeDienst, Bron>> {
  await primeKeuzes();
  const v = { ...cache.v, [id]: bron };
  await kvSet(KEY, v);
  cache = { v, at: Date.now() };
  return v;
}

/**
 * Pakken we voor deze dienst onze eigen bron? `heeftSleutel` zegt of de
 * betaalde dienst überhaupt kán: zonder sleutel is het altijd de eigen bron.
 */
export function gebruikEigen(id: KeuzeDienst, heeftSleutel: boolean): boolean {
  if (!heeftSleutel) return true;
  const keuze = keuzeVoor(id);
  if (keuze === "eigen") return true;
  if (keuze === "betaald") return false;
  return gratisAan();
}

/** Zoals gebruikEigen, maar ververst eerst beide standen uit KV. */
export async function gebruikEigenVers(id: KeuzeDienst, heeftSleutel: boolean): Promise<boolean> {
  await Promise.all([primeGratis(), primeKeuzes()]);
  return gebruikEigen(id, heeftSleutel);
}

/** Mag de betaalde dienst nog als terugval dienen als onze eigen bron niets vindt? */
export function betaaldeTerugvalMag(id: KeuzeDienst, heeftSleutel: boolean): boolean {
  return heeftSleutel && keuzeVoor(id) !== "eigen";
}
