import { randomBytes } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Geschiedenis van de sitetekst (Site-ontwerper → Teksten): elke opgeslagen
// wijziging met de oude en de nieuwe tekst, de laatste 200. Zo kan een tekst
// altijd terug naar een eerdere versie (die gaat via gewoon Opslaan weer live).
// ---------------------------------------------------------------------------

export interface TekstWijziging {
  id: string;
  key: string;
  oud: string;
  nieuw: string;
  /** ISO-tijd (UTC) */
  op: string;
}

const KEY = "content:geschiedenis";
const MAX = 200;

export async function tekstGeschiedenis(): Promise<TekstWijziging[]> {
  return (await kvGet<TekstWijziging[]>(KEY).catch(() => null)) ?? [];
}

/** Een wijziging vastleggen; gelijk gebleven = niets. Een storing in de opslag houdt het opslaan zelf niet tegen. */
export async function bewaarTekstWijziging(key: string, oud: string, nieuw: string): Promise<TekstWijziging[]> {
  const lijst = await tekstGeschiedenis();
  if (oud === nieuw) return lijst;
  const nieuweLijst = [{ id: randomBytes(6).toString("hex"), key, oud, nieuw, op: new Date().toISOString() }, ...lijst].slice(0, MAX);
  await kvSet(KEY, nieuweLijst).catch(() => undefined);
  return nieuweLijst;
}
