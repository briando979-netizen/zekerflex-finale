import { createHash } from "node:crypto";
import { cached } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { gebruikEigenVers } from "@/lib/gratis/keuzes";
import { autocompleteCompanies, isKvkBaseEnabled, lookupCompany, searchCompanies } from "@/lib/integrations/kvkbase";
import { osmZoekBedrijven } from "@/lib/integrations/osm-plaatsen";
import { bedrijfOpNummer, onthoudBedrijven, zoekInIndex } from "@/lib/kvk/index-opslag";
import { isLimiet, osmNaarTreffer, profielNaarBedrijf, treffNaarBedrijf } from "@/lib/kvk/bronnen";
import { normaliseer, woorden } from "@/lib/kvk/normaliseer";
import { zaaiAlsNodig } from "@/lib/kvk/zaad";
import type { KvkBronnen } from "@/lib/kvk/zoek";

// ---------------------------------------------------------------------------
// De echte bronnen onder de zoekdienst (lib/kvk/zoek.ts): onze eigen index,
// KVKBase en OpenStreetMap. Hier zit alles wat sleutels, KV, Redis en netwerk
// aanraakt; de zoekdienst zelf blijft puur genoeg om te testen.
// ---------------------------------------------------------------------------

const ZOEK_CACHE_S = 12 * 3600;
/** Na een limiet vragen we KVKBase een tijd niets meer: de dienst loopt er toch tegenaan. */
const PAUZE_NA_LIMIET_MS = 10 * 60_000;

// Next bundelt elke route apart: gedeelde staat dus via globalThis (zie AGENTS.md).
const g = globalThis as unknown as { __zfKvkPauzeTot?: number };

/** Mag KVKBase nu: sleutel aanwezig, niet door de eigenaar op "eigen" gezet, en geen limiet in de laatste minuten. */
async function registerToegestaan(): Promise<boolean> {
  if (!isKvkBaseEnabled()) return false;
  if (Date.now() < (g.__zfKvkPauzeTot ?? 0)) return false;
  return !(await gebruikEigenVers("kvk-zoeken", true));
}

function nuLimiet(err: unknown): void {
  if (isLimiet(err)) g.__zfKvkPauzeTot = Date.now() + PAUZE_NA_LIMIET_MS;
}

async function registerZoek(q: string) {
  const sleutel = `kvk-zoek:v2:${createHash("sha256").update(q.toLowerCase()).digest("hex").slice(0, 32)}`;
  try {
    return await cached(sleutel, ZOEK_CACHE_S, async () => {
      try {
        const hits = await autocompleteCompanies(q);
        return hits.slice(0, 8).map((h) => ({ kvkNumber: h.kvkNumber, name: h.name, city: h.city, actief: null as boolean | null }));
      } catch (err) {
        // bij een limiet niet meteen nog een vraag aan dezelfde dienst
        if (isLimiet(err)) throw err;
        const hits = await searchCompanies(q);
        return hits.slice(0, 8).map((h) => ({ kvkNumber: h.kvkNumber, name: h.legalName, city: h.city, actief: h.isActive as boolean | null }));
      }
    }).then((lijst) => lijst.map((t) => treffNaarBedrijf(t)).filter((b) => b !== null));
  } catch (err) {
    nuLimiet(err);
    throw err;
  }
}

async function registerOpNummer(kvk: string) {
  try {
    const profiel = await lookupCompany(kvk);
    return profielNaarBedrijf(profiel);
  } catch (err) {
    nuLimiet(err);
    // een onbekend nummer is geen storing; alles anders melden we door
    if (err instanceof Error && /Geen inschrijving/i.test(err.message)) return null;
    throw err;
  }
}

/** Het adres van een bedrijf dat we bij naam en plaats in OpenStreetMap vinden; alleen als naam én plaats kloppen. */
async function osmAdresVoor(naam: string, plaats: string | null) {
  if (!plaats) return null; // zonder plaats is een naamtreffer te vaak een ander bedrijf
  const gevonden = await osmZoekBedrijven(`${naam} ${plaats}`, { aantal: 3 });
  const naamWoorden = woorden(naam).filter((w) => w.length >= 3);
  const plaatsNorm = normaliseer(plaats);
  for (const p of gevonden) {
    if (!p.adres || normaliseer(p.plaats ?? "") !== plaatsNorm) continue;
    const pw = woorden(p.naam);
    if (naamWoorden.length > 0 && !naamWoorden.every((w) => pw.some((x) => x.startsWith(w) || w.startsWith(x)))) continue;
    const t = osmNaarTreffer(p);
    if (t.street) return { street: t.street, houseNumber: t.houseNumber, postalCode: t.postalCode, city: t.city };
  }
  return null;
}

export function echteBronnen(): KvkBronnen {
  return {
    index: { zoek: zoekInIndex, opNummer: bedrijfOpNummer, onthoud: onthoudBedrijven },
    register: { toegestaan: registerToegestaan, zoek: registerZoek, opNummer: registerOpNummer },
    osm: {
      zoek: async (term) => (await osmZoekBedrijven(term, { aantal: 5 })).map(osmNaarTreffer),
      adresVoor: async (naam, plaats) => {
        try {
          return await osmAdresVoor(naam, plaats);
        } catch (err) {
          logger.warn("kvk adres via osm mislukt", { fout: (err as Error).message.slice(0, 120) });
          return null;
        }
      },
    },
    zaai: zaaiAlsNodig,
  };
}
