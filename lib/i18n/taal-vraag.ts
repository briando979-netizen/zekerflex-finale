import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Anonieme telling van taalvraag (13 nov 2026, poortwachter 86): per dag de eerste taalcode uit Accept-Language, één keer
// per sessie. De volgende taalgolf van de talen-motor wordt op deze cijfers gekozen. Alleen een teller per taalcode in
// KV `meting:taal-vraag:<jjjj-mm-dd>`: geen IP, geen userId, geen pad, geen tijdstip per bezoek. De sleutels zijn per dag
// en niet per gebruiker, dus geen persoonsgegeven en niet in ERASABLE_KV_PREFIXES. De lijst taalcodes is vast (plus
// "overig"), zodat de sleutelruimte klein blijft. Fail-open: een storing telt niet en houdt nooit het laden tegen.
// ---------------------------------------------------------------------------

export const TAALVRAAG_CODES = [
  "nl", "en", "de", "fr", "es", "pt", "it", "tr", "bg", "pl", "ro", "uk", "ru", "ar", "hu", "cs", "sk", "hr", "sr", "el", "lt", "lv", "so", "ti", "fa", "ur", "hi", "zh",
] as const;
export type TaalVraagCode = (typeof TAALVRAAG_CODES)[number] | "overig";

/** Cookie dat zegt dat deze sessie al geteld is (sessiecookie, geen id). */
export const TAALVRAAG_COOKIE = "zf_taal_geteld";

/** De eerste taalcode uit een Accept-Language-kop ("tr-TR,tr;q=0.9,en;q=0.8" -> "tr"); alles buiten de vaste lijst is "overig". */
export function eersteTaalcode(kop: string | null | undefined): TaalVraagCode {
  const eerste = (kop ?? "").split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  const hoofd = eerste.split("-")[0] ?? "";
  return (TAALVRAAG_CODES as readonly string[]).includes(hoofd) ? (hoofd as TaalVraagCode) : "overig";
}

export const taalVraagSleutel = (nu: Date): string => `meting:taal-vraag:${amsterdamDayKey(nu)}`;

export type TaalVraagTelling = Partial<Record<TaalVraagCode, number>>;

/** Telt één sessie. Geeft nooit een fout: bij een KV-storing wordt er niet geteld. */
export async function telTaalVraag(kop: string | null | undefined, nu: Date = new Date()): Promise<boolean> {
  try {
    const sleutel = taalVraagSleutel(nu);
    const code = eersteTaalcode(kop);
    const oud = (await kvGet<TaalVraagTelling>(sleutel)) ?? {};
    await kvSet(sleutel, { ...oud, [code]: (oud[code] ?? 0) + 1 });
    return true;
  } catch {
    return false;
  }
}