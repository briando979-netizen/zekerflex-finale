import { CompanyStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { fixedWindow } from "@/lib/rate-limit";
import type { CompanyProfile } from "@/types/company";

// ---------------------------------------------------------------------------
// De gratis open dataset van KVK (15 nov 2026): "Open Dataset Basis Bedrijfsgegevens", licentie CC BY 4.0, zonder sleutel.
//   GET https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/kvknummer/<8 cijfers>
//   → { datumAanvang, actief: "J"|"N", insolventieCode?, rechtsvormCode: "BV"|"NV", postcodeRegio, activiteiten[], lidstaat }
// Gemeten 15 nov: ASML (NV) geeft 200 met actief "J"; een tweede aanvraag binnen een minuut geeft 429 (één per minuut per
// IP-adres, en 200 per vijf minuten voor alle gebruikers samen).
// Wat het wel en niet kan, eerlijk: het bevestigt dat een nummer bestaat en actief is (en geen insolventie heeft), maar
//   - alleen voor BV's en NV's: een eenmanszaak (de meeste zzp'ers), VOF en maatschap staan er NIET in;
//   - zonder naam, adres of btw-nummer (de gegevens zijn bewust zonder naam en met alleen de eerste twee cijfers van de postcode).
// Daarom is dit alleen de terugval als het KVKBase-tegoed op is (lib/integrations/kvkbase.ts), nooit de eerste keuze, en wat
// hier niet gevonden wordt, blijft in de wacht tot er tegoed is of een betaalde bron. Nooit cachen als volledig profiel.
// ---------------------------------------------------------------------------

export const OPEN_DATA_URL = "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/kvknummer";
/** In `raw.bron`, zodat de rest van de code weet dat dit een beperkt profiel is. */
export const OPEN_DATA_BRON = "kvk-open-data";

const RECHTSVORM: Record<string, string> = { BV: "Besloten Vennootschap", NV: "Naamloze Vennootschap" };

type Raw = Record<string, unknown>;
const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "19941003" → "1994-10-03"; een datum met nullen is onbekend (zo staat het in de documentatie). */
export function openDataDatum(v: unknown): string | null {
  const s = tekst(v);
  if (!s || !/^\d{8}$/.test(s)) return null;
  const j = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  if (j === "0000" || m === "00" || d === "00") return null;
  return `${j}-${m}-${d}`;
}

/** Het antwoord van de open dataset naar ons eigen profiel; null als het geen bruikbaar antwoord is. Puur. */
export function openDataNaarProfiel(kvkNummer: string, raw: unknown): CompanyProfile | null {
  if (!/^\d{8}$/.test(kvkNummer) || !raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const actief = tekst(r.actief)?.toUpperCase();
  if (actief !== "J" && actief !== "N") return null; // geen herkenbaar antwoord: liever niets dan raden
  const insolvent = Boolean(tekst(r.insolventieCode));
  const status = actief === "J" ? CompanyStatus.ACTIVE : CompanyStatus.DISSOLVED;
  const code = tekst(r.rechtsvormCode)?.toUpperCase() ?? null;
  const activiteiten = (Array.isArray(r.activiteiten) ? r.activiteiten : [])
    .map((a) => a as Raw)
    .filter((a) => tekst(a.sbiCode))
    .map((a) => ({ sbiCode: tekst(a.sbiCode) as string, description: null, isMain: /hoofd/i.test(tekst(a.soortActiviteit) ?? "") }));
  return {
    kvkNumber: kvkNummer,
    // de open dataset levert bewust geen naam
    legalName: "Onbekend",
    tradeName: null,
    legalForm: code ? (RECHTSVORM[code] ?? code) : null,
    status,
    isActive: status === CompanyStatus.ACTIVE,
    insolvent,
    establishmentNumber: null,
    address: { street: null, houseNumber: null, postalCode: null, city: null, country: "NL" },
    activities: activiteiten,
    sbiCodes: activiteiten.map((a) => a.sbiCode),
    registrationDate: openDataDatum(r.datumAanvang),
    employeeCount: null,
    vat: null,
    raw: { bron: OPEN_DATA_BRON, ...r },
  };
}

/** Is dit een beperkt profiel uit de open dataset (zonder naam, adres en btw)? */
export function isOpenDataProfiel(profiel: Pick<CompanyProfile, "raw">): boolean {
  const raw = profiel.raw as Raw | null | undefined;
  return Boolean(raw && typeof raw === "object" && raw.bron === OPEN_DATA_BRON);
}

/**
 * Eén opvraging, met een eigen rem van één per 65 seconden (de grens van KVK is één per minuut per IP). Gooit nooit: geen
 * antwoord (niet gevonden = geen BV/NV, limiet, storing, rem) is null en de aanroeper valt terug op de wacht.
 */
export async function lookupOpenData(kvkNummer: string, haal: typeof fetch = fetch): Promise<CompanyProfile | null> {
  if (!/^\d{8}$/.test(kvkNummer)) return null;
  const rem = await fixedWindow("rl:kvk-open-data", 1, 65, { failOpen: false }).catch(() => ({ ok: false }));
  if (!rem.ok) return null;
  try {
    const res = await haal(`${OPEN_DATA_URL}/${kvkNummer}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) {
      // 404 = geen BV/NV (of geen inschrijving), 429 = de grens van KVK: allebei gewoon "geen antwoord"
      if (res.status !== 404 && res.status !== 429) logger.warn("kvk open data: onverwacht antwoord", { status: res.status });
      return null;
    }
    return openDataNaarProfiel(kvkNummer, await res.json().catch(() => null));
  } catch (err) {
    logger.warn("kvk open data: opvraging mislukt", { error: (err as Error).message });
    return null;
  }
}
