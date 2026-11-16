// ---------------------------------------------------------------------------
// Aanbestedingen van TenderNed (16 nov 2026, eigenaar: "go" op de gratis API's): overheidsopdrachten waarop ZekerFlex of
// zijn klanten kunnen inschrijven, voor Beheer → Sales & groei → Aanbestedingen. Openbare JSON-dienst van TenderNed,
// zonder sleutel (data.overheid.nl: "kan zonder aankondiging veranderen"; daarom soepel lezen en bewaren). Gemeten
// 16 nov: ?cpvCodes= mag herhaald worden (of), nieuwste eerst, 100 per pagina. Een aanbesteding vraagt zelf om
// inschrijvingen: dit is geen koude benadering. Puur bestand; de server staat in tenderned-server.ts.
// ---------------------------------------------------------------------------

/** De groepen opdrachten die bij ZekerFlex passen, met hun CPV-codes (Europese indeling van opdrachten). */
export const TENDER_GROEPEN = [
  { id: "personeel", naam: "Personeel en uitzendkrachten", cpv: ["79620000-6", "79610000-3", "79600000-0", "79625000-1"] },
  { id: "schoonmaak", naam: "Schoonmaak", cpv: ["90910000-9", "90911200-8", "90919200-4"] },
  { id: "horeca", naam: "Catering en horeca", cpv: ["55520000-1", "55300000-3", "55500000-5"] },
] as const;
export type TenderGroep = (typeof TENDER_GROEPEN)[number]["id"];

export interface Aanbesteding {
  id: string;
  titel: string;
  opdrachtgever: string;
  groep: TenderGroep;
  /** ISO-tijd waarop inschrijven sluit */
  sluit: string;
  /** publicatiedatum "2026-11-16" */
  gepubliceerd: string;
  procedure: string | null;
  europees: boolean;
  omschrijving: string;
  link: string;
}

const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const omschrijvingVan = (v: unknown) => (v && typeof v === "object" && typeof (v as { omschrijving?: unknown }).omschrijving === "string" ? ((v as { omschrijving: string }).omschrijving as string) : null);

/**
 * De open aankondigingen uit één antwoord: alleen "Aankondiging opdracht" (AAO) die nog niet gesloten is. Een item
 * zonder id, titel of sluitingsdatum valt weg. De link gaat alleen naar tenderned.nl.
 */
export function leesAanbestedingen(raw: unknown, groep: TenderGroep, nu: number): Aanbesteding[] {
  const lijst = raw && typeof raw === "object" && Array.isArray((raw as { content?: unknown }).content) ? ((raw as { content: unknown[] }).content as Record<string, unknown>[]) : [];
  const uit: Aanbesteding[] = [];
  for (const x of lijst) {
    if (!x || typeof x !== "object") continue;
    const type = x.typePublicatie && typeof x.typePublicatie === "object" ? (x.typePublicatie as { code?: unknown }).code : null;
    const id = typeof x.publicatieId === "string" || typeof x.publicatieId === "number" ? String(x.publicatieId) : "";
    const sluitRaw = typeof x.sluitingsDatum === "string" ? x.sluitingsDatum : "";
    // TenderNed geeft de sluitingstijd zonder zone; het is Nederlandse tijd
    const sluit = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sluitRaw) ? sluitRaw.slice(0, 16) : "";
    if (type !== "AAO" || !/^\d+$/.test(id) || !sluit || !tekst(x.aanbestedingNaam, 1)) continue;
    // ruim rekenen (een uur speling voor de tijdzone): wat vandaag nog open is, blijft staan
    if (Date.parse(`${sluit}:00Z`) + 3600_000 < nu) continue;
    const link = x.link && typeof x.link === "object" && typeof (x.link as { href?: unknown }).href === "string" ? (x.link as { href: string }).href : "";
    uit.push({
      id,
      titel: tekst(x.aanbestedingNaam, 200),
      opdrachtgever: tekst(x.opdrachtgeverNaam, 120) || "onbekend",
      groep,
      sluit,
      gepubliceerd: tekst(x.publicatieDatum, 10),
      procedure: omschrijvingVan(x.procedure),
      europees: x.europees === true,
      omschrijving: tekst(x.opdrachtBeschrijving, 400),
      link: /^https:\/\/www\.tenderned\.nl\//.test(link) ? link : `https://www.tenderned.nl/aankondigingen/overzicht/${id}`,
    });
  }
  return uit;
}

/** Samenvoegen (een opdracht kan in twee groepen vallen: de eerste telt) en sorteren: wat het eerst sluit bovenaan. */
export function voegSamen(lijsten: readonly Aanbesteding[][]): Aanbesteding[] {
  const gezien = new Map<string, Aanbesteding>();
  for (const l of lijsten) for (const a of l) if (!gezien.has(a.id)) gezien.set(a.id, a);
  return [...gezien.values()].sort((a, b) => a.sluit.localeCompare(b.sluit));
}

/** Dagen tot het sluiten (afgerond naar beneden; 0 = vandaag). */
export const dagenTot = (sluit: string, nu: number) => Math.max(0, Math.floor((Date.parse(`${sluit}:00Z`) - nu) / 86_400_000));
