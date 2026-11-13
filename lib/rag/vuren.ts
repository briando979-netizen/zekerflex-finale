import { kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// "Vuren": hoe vaak een geheugenstuk (RagChunk) echt wordt geraadpleegd. Elke
// zoekopdracht over de index (lib/rag/store.ts, search) telt de gevonden stukken
// hier; het Brein (Admin → Kennisgraaf) laat per cluster zien welk deel van de
// neuronen de laatste zeven dagen vuurde. Een echte meting, geen schatting: zonder
// tellingen zegt het scherm "geen activiteit gemeten". Tellen gebeurt in het
// geheugen en gaat elke 30 s in één KV-schrijfactie naar `brein:vuren:<dag>`
// (alleen stuk-id's en aantallen, geen persoon, geen vraagtekst); ouder dan 30
// dagen gaat weg. Een storing hier mag nooit een vraag hinderen.
// ---------------------------------------------------------------------------

export const VUREN_PREFIX = "brein:vuren:";
const BUFFER_MS = 30_000;
const BEWAREN_DAGEN = 30;
const OPRUIMEN_ELKE = 20;

interface Buffer {
  tellingen: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  schrijfbeurten: number;
}
const g = globalThis as typeof globalThis & { __zfVuren?: Buffer };
const buf: Buffer = (g.__zfVuren ??= { tellingen: new Map(), timer: null, schrijfbeurten: 0 });

/** Telt geraadpleegde stukken (fire-and-forget); schrijft vanzelf na 30 s. */
export function telVuren(ids: readonly string[]): void {
  if (ids.length === 0) return;
  for (const id of ids) buf.tellingen.set(id, (buf.tellingen.get(id) ?? 0) + 1);
  if (!buf.timer) {
    buf.timer = setTimeout(() => {
      buf.timer = null;
      void schrijfVuren();
    }, BUFFER_MS);
    // de timer houdt het proces niet wakker (tests, afsluiten)
    (buf.timer as { unref?: () => void }).unref?.();
  }
}

/** Wat er in het geheugen staat naar de KV van vandaag; geeft het aantal verschillende stukken. */
export async function schrijfVuren(nu: Date = new Date()): Promise<number> {
  const stand = buf.tellingen;
  if (stand.size === 0) return 0;
  buf.tellingen = new Map();
  const sleutel = `${VUREN_PREFIX}${amsterdamDayKey(nu)}`;
  try {
    const oud = (await kvGet<Record<string, number>>(sleutel)) ?? {};
    for (const [id, n] of stand) oud[id] = (oud[id] ?? 0) + n;
    await kvSet(sleutel, oud);
    buf.schrijfbeurten += 1;
    if (buf.schrijfbeurten % OPRUIMEN_ELKE === 0) await kvDeleteStale(VUREN_PREFIX, new Date(nu.getTime() - BEWAREN_DAGEN * 86_400_000)).catch(() => 0);
  } catch {
    // een telling mag nooit een vraag hinderen; deze beurt gaat verloren
  }
  return stand.size;
}

export interface VuurStand {
  /** per stuk-id het aantal raadplegingen in de periode */
  perNeuron: Map<string, number>;
  dagen: number;
  /** is er ooit iets geteld? Zo niet, dan zegt het scherm "geen activiteit gemeten" */
  gemeten: boolean;
}

/** De raadplegingen van de laatste `dagen` dagen (vandaag meegerekend); een storing geeft een lege, niet-gemeten stand. */
export async function vuurStand(dagen = 7, nu: Date = new Date()): Promise<VuurStand> {
  const perNeuron = new Map<string, number>();
  try {
    const rijen = await kvListEntries<Record<string, number>>(VUREN_PREFIX, 120);
    const grens = amsterdamDayKey(new Date(nu.getTime() - (dagen - 1) * 86_400_000));
    for (const r of rijen) {
      const dag = r.key.slice(VUREN_PREFIX.length);
      if (dag < grens || !r.value || typeof r.value !== "object") continue;
      for (const [id, n] of Object.entries(r.value)) if (typeof n === "number") perNeuron.set(id, (perNeuron.get(id) ?? 0) + n);
    }
    return { perNeuron, dagen, gemeten: rijen.length > 0 };
  } catch {
    return { perNeuron, dagen, gemeten: false };
  }
}
