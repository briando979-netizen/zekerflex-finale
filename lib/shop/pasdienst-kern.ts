// ---------------------------------------------------------------------------
// De echte paskamer (13 nov 2026, eigenaar: "het is de bedoeling dat de foto van de persoon echt letterlijk verandert
// qua kleren", en daarna "ja ja" op een betaalde dienst). Een bezoeker kiest een kledingstuk en zijn eigen foto; een
// pasdienst (FASHN, tryon-v1.6) maakt een beeld van die persoon in dat kledingstuk. Puur bestand: de regels die de
// route, het beheerscherm en de test delen. Het ophalen en de sleutel staan in lib/shop/pasdienst.ts (alleen server).
//
// Waarom FASHN: gemaakt voor precies dit (kleding op een persoon), per beeld te betalen, en volgens hun eigen
// documentatie (docs.fashn.ai, "Data retention & privacy", gelezen 13 nov) worden klantbeelden niet gebruikt om
// modellen te trainen, wordt een foto die als base64 binnenkomt gewist zodra het beeld klaar is (uiterlijk na een dag)
// en blijft een uitkomst als base64 hooguit 60 minuten bij hen staan. Wij bewaren niets: geen KV, geen database, geen
// log, geen bestand; de foto en het beeld gaan alleen door het geheugen van één verzoek.
// ---------------------------------------------------------------------------

export const PASDIENST_HOST = "api.fashn.ai";
export const PASDIENST_NAAM = "FASHN";
export const PASDIENST_MODEL = "tryon-v1.6";

/** Wat één beeld ons ongeveer kost (FASHN: $ 0,075 per beeld, 13 nov), in eurocent, afgerond naar boven. */
export const KOSTEN_PER_BEELD_CENT = 8;
/** Standaard dagplafond: laag, zodat een fout of een drukke dag nooit veel kost. De eigenaar zet het hoger in Beheer. */
export const STANDAARD_PLAFOND_EURO = 2;
export const MAX_PLAFOND_EURO = 100;
/** Per bezoeker (IP): zoveel beelden per uur en per dag. */
export const PER_UUR = 6;
export const PER_DAG = 15;
/** De foto komt verkleind van de browser (de dienst werkt op 864 × 1296); de openbare grens is 1 MB per verzoek. */
export const MAX_FOTO_TEKENS = 900_000;
/** Zo lang wachten we op een beeld; daarna eerlijk "het duurde te lang" en terug naar de paspop. */
export const WACHT_MS = 45_000;

/** Hoeveel beelden passen er vandaag in het plafond? */
export function beeldenPerDag(plafondEuro: number): number {
  const euro = Number.isFinite(plafondEuro) ? Math.min(MAX_PLAFOND_EURO, Math.max(0, plafondEuro)) : STANDAARD_PLAFOND_EURO;
  return Math.floor((euro * 100) / KOSTEN_PER_BEELD_CENT);
}

export type FotoFout = "geen-foto" | "geen-afbeelding" | "te-groot";

/** Is dit een foto die we mogen doorsturen? Alleen een data-URI van een JPEG, PNG of WebP, niet te groot. */
export function controleerFoto(waarde: unknown): { ok: true; foto: string } | { ok: false; fout: FotoFout } {
  if (typeof waarde !== "string" || waarde.length === 0) return { ok: false, fout: "geen-foto" };
  if (waarde.length > MAX_FOTO_TEKENS) return { ok: false, fout: "te-groot" };
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(waarde)) return { ok: false, fout: "geen-afbeelding" };
  return { ok: true, foto: waarde };
}

/** Welk deel van het lichaam: de dienst kiest zelf als we het niet zeker weten. */
export function categorieVoor(soort: string | null | undefined): "tops" | "bottoms" | "one-pieces" | "auto" {
  const s = (soort ?? "").toLowerCase();
  if (/(broek|jeans|rok|short|legging)/.test(s)) return "bottoms";
  if (/(jurk|overall|jumpsuit|pak\b)/.test(s)) return "one-pieces";
  if (/(shirt|trui|hoodie|jas|jack|vest|blouse|top|polo|sweater|coat|jacket)/.test(s)) return "tops";
  return "auto";
}

/** Het verzoek aan de dienst: altijd base64 terug (dan staat het beeld bij hen hooguit een uur), voorzichtig modereren. */
export function verzoekLichaam(foto: string, kledingUrl: string, categorie: ReturnType<typeof categorieVoor>) {
  return {
    model_name: PASDIENST_MODEL,
    inputs: {
      model_image: foto,
      garment_image: kledingUrl,
      category: categorie,
      mode: "balanced",
      output_format: "jpeg",
      return_base64: true,
      num_samples: 1,
      moderation_level: "conservative",
    },
  } as const;
}

export type Uitslag = { soort: "klaar"; beeld: string } | { soort: "bezig" } | { soort: "mislukt"; reden: "geen-pose" | "geweigerd" | "storing" };

/** Het antwoord van de statusvraag soepel lezen: alleen een data-URI van een afbeelding telt als beeld. */
export function leesStatus(antwoord: unknown): Uitslag {
  const a = antwoord && typeof antwoord === "object" ? (antwoord as Record<string, unknown>) : {};
  const status = typeof a.status === "string" ? a.status : "";
  if (status === "completed") {
    const eerste = Array.isArray(a.output) ? a.output[0] : null;
    return typeof eerste === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(eerste) ? { soort: "klaar", beeld: eerste } : { soort: "mislukt", reden: "storing" };
  }
  if (status === "failed" || status === "canceled" || status === "cancelled") {
    const fout = a.error && typeof a.error === "object" ? (a.error as Record<string, unknown>) : {};
    const naam = String(fout.name ?? "");
    if (/pose/i.test(naam)) return { soort: "mislukt", reden: "geen-pose" };
    if (/moderat|content|nsfw|policy/i.test(naam)) return { soort: "mislukt", reden: "geweigerd" };
    return { soort: "mislukt", reden: "storing" };
  }
  return { soort: "bezig" };
}

/** Een kledingfoto moet een gewone openbare https-link zijn (de dienst haalt hem zelf op); onze eigen paden maken we heel. */
export function kledingLink(imageUrl: string | null | undefined, eigenSite: string): string | null {
  const u = (imageUrl ?? "").trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return `${eigenSite.replace(/\/$/, "")}${u}`;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}
