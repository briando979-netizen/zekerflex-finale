// ---------------------------------------------------------------------------
// RDW Open Data (16 nov 2026, eigenaar: "go" op de gratis API's): de openbare gegevens van een Nederlands kenteken
// (opendata.rdw.nl, gratis en zonder sleutel; geen gegevens over de eigenaar). Gebruikt om een voertuig in het wagenpark
// in te vullen: merk en model, kleur, de APK-vervaldatum (voor de APK-waarschuwing) en het laadvermogen. Puur bestand:
// het antwoord lezen. De server staat in rdw-server.ts.
// ---------------------------------------------------------------------------

export interface RdwVoertuig {
  kenteken: string;
  /** "Toyota Auris" */
  merkModel: string;
  kleur: string | null;
  /** Nederlandse kalenderdag "2027-05-13"; null = onbekend of geen APK-plicht */
  apk: string | null;
  brandstof: string | null;
  /** "Personenauto", "Bedrijfsauto", … */
  soort: string | null;
  /** bij een bedrijfsauto: wat hij mag laden (kg); anders null */
  laadvermogenKg: number | null;
  /** jaar van de eerste toelating */
  bouwjaar: number | null;
}

const hoofdletterWoorden = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, voor: string, l: string) => `${voor}${l.toUpperCase()}`);
const dagVan = (v: unknown) => (typeof v === "string" && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
const getal = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : null);
const tekst = (v: unknown) => (typeof v === "string" && v.trim() && !/niet geregistreerd|geen verstrekking/i.test(v) ? v.trim() : null);

/**
 * Het eerste voertuig uit het antwoord van de dataset "Gekentekende voertuigen" (m9d7-ebf2), met de brandstof uit
 * "Gekentekende voertuigen brandstof" (8ys7-d773) als die er is. Null = onbekend kenteken.
 */
export function leesRdw(voertuigen: unknown, brandstof: unknown): RdwVoertuig | null {
  const v = Array.isArray(voertuigen) ? (voertuigen[0] as Record<string, unknown> | undefined) : undefined;
  if (!v || typeof v.kenteken !== "string") return null;
  const merk = tekst(v.merk) ?? "";
  // de handelsbenaming herhaalt vaak het merk ("TOYOTA AURIS"): het merk niet dubbel noemen
  const model = (tekst(v.handelsbenaming) ?? "").replace(new RegExp(`^${merk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "");
  const b = Array.isArray(brandstof) ? (brandstof[0] as Record<string, unknown> | undefined) : undefined;
  const soort = tekst(v.voertuigsoort);
  const max = getal(v.toegestane_maximum_massa_voertuig);
  const rijklaar = getal(v.massa_rijklaar);
  const eerste = dagVan(v.datum_eerste_toelating);
  return {
    kenteken: v.kenteken,
    merkModel: hoofdletterWoorden([merk, model].filter(Boolean).join(" ").trim()),
    kleur: tekst(v.eerste_kleur)?.toLowerCase() ?? null,
    apk: dagVan(v.vervaldatum_apk),
    brandstof: tekst(b?.brandstof_omschrijving)?.toLowerCase() ?? null,
    soort,
    laadvermogenKg: soort === "Bedrijfsauto" && max && rijklaar && max > rijklaar ? max - rijklaar : null,
    bouwjaar: eerste ? Number(eerste.slice(0, 4)) : null,
  };
}

/** De omschrijving voor het wagenpark: "Toyota Auris, blauw, benzine (2011)". */
export function rdwOmschrijving(v: RdwVoertuig): string {
  return `${[v.merkModel, v.kleur, v.brandstof].filter(Boolean).join(", ")}${v.bouwjaar ? ` (${v.bouwjaar})` : ""}`.slice(0, 120);
}
