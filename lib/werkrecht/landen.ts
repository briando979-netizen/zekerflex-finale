// ---------------------------------------------------------------------------
// Recht om te werken per land (9 nov 2026). Puur: geen prisma, los te testen
// (tests/werkrecht.test.ts) en ook bruikbaar in een clientcomponent.
//
// Per land waar iemand wil werken:
//  1. een verklaring die hij zelf aanvinkt ("ik mag in <land> werken en meld
//     het als dat verandert"), en
//  2. een bewijs. Wie met de eigen ID-controle een paspoort of ID-kaart uit de
//     EU, de EER of Zwitserland liet zien, mag vrij werken in al die landen
//     (vrij verkeer van werknemers): dat document is dan het bewijs. Anders
//     uploadt hij een document (verblijfsdocument met "arbeid vrij toegestaan",
//     een werkvergunning, of zijn paspoort/ID-kaart als hij zich met een
//     rijbewijs aanmeldde) en kijkt een medewerker het na. Pas na goedkeuren
//     telt het (Wet arbeid vreemdelingen: controle vóór het werk begint).
// Buiten de EU/EER/CH is altijd een document nodig, ook met een EU-paspoort.
// ---------------------------------------------------------------------------

/** Versie van de verklaring; een nieuwe tekst = een nieuwe versie (opnieuw aanvinken). */
export const VERKLARING_VERSIE = "2026-11-09";

/** EU-27, EER (IJsland, Liechtenstein, Noorwegen) en Zwitserland, ISO 3166-1 alpha-2. */
export const VRIJ_VERKEER = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "CH",
]);

/** Landen om uit te kiezen: Nederland eerst, dan de EU/EER/CH, dan veelgevraagde landen daarbuiten. */
export const WERK_LANDEN: readonly string[] = [
  "NL",
  ...[...VRIJ_VERKEER].filter((c) => c !== "NL"),
  "GB", "US", "CA", "AU", "NZ", "AE", "QA", "SA", "TR", "UA", "RS", "BA", "MK", "AL", "MD", "GE", "MA", "ZA", "SG", "JP",
];

const LANDEN = new Set(WERK_LANDEN);

/** Een geldige landcode uit de keuzelijst, of null. */
export function landUit(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return LANDEN.has(c) ? c : null;
}

/** Naam van een land in de taal van de werker (Intl), anders de code. */
export function landNaam(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type WerkrechtStand =
  | "verklaring-nodig" // nog niet aangevinkt (of een oude versie)
  | "bewijs-nodig" // aangevinkt, nog geen bewijs
  | "wacht" // document geüpload, een medewerker kijkt
  | "afgewezen" // document afgewezen: een nieuw document nodig
  | "verlopen" // goedgekeurd, maar de geldigheid is voorbij
  | "ok";

export interface WerkrechtRij {
  declaredAt: Date | null;
  declaration: string | null;
  uploadId: string | null;
  status: "UPLOADED" | "APPROVED" | "REJECTED" | null;
  validUntil: Date | null;
}

export interface WerkrechtUitslag {
  stand: WerkrechtStand;
  /** waarmee het recht bewezen is (alleen bij "ok") */
  via: "id" | "document" | null;
}

/**
 * De stand voor één land. `idVrij` = de laatste goedgekeurde eigen ID-controle las
 * een EU/EER/CH-paspoort of -ID-kaart (werkrecht "vrij" uit de MRZ).
 */
export function werkrechtUitslag(land: string, rij: WerkrechtRij | null, idVrij: boolean, nu: Date): WerkrechtUitslag {
  if (!rij?.declaredAt || rij.declaration !== VERKLARING_VERSIE) return { stand: "verklaring-nodig", via: null };
  if (rij.uploadId && rij.status === "APPROVED") {
    if (rij.validUntil && rij.validUntil.getTime() < nu.getTime()) {
      // een verlopen document; met een EU-document uit de ID-controle blijft het recht wel
      return idVrij && VRIJ_VERKEER.has(land) ? { stand: "ok", via: "id" } : { stand: "verlopen", via: null };
    }
    return { stand: "ok", via: "document" };
  }
  if (idVrij && VRIJ_VERKEER.has(land)) return { stand: "ok", via: "id" };
  if (rij.uploadId && rij.status === "UPLOADED") return { stand: "wacht", via: null };
  if (rij.uploadId && rij.status === "REJECTED") return { stand: "afgewezen", via: null };
  return { stand: "bewijs-nodig", via: null };
}

/** De melding als iemand (nog) niet mag werken; null als het in orde is. Voor de controle vóór een dienst. */
export function werkrechtReden(stand: WerkrechtStand, landNaamNl: string): string | null {
  switch (stand) {
    case "ok":
      return null;
    case "verklaring-nodig":
      return `Vink bij Verificatie de verklaring aan dat je in ${landNaamNl} mag werken.`;
    case "bewijs-nodig":
      return `Upload bij Verificatie een document waaruit blijkt dat je in ${landNaamNl} mag werken: een paspoort of ID-kaart (geen rijbewijs), een verblijfsdocument of een werkvergunning.`;
    case "wacht":
      return `Je document voor werken in ${landNaamNl} wordt nog nagekeken. Daarna kun je diensten aannemen.`;
    case "afgewezen":
      return `Je document voor werken in ${landNaamNl} is afgewezen. Upload bij Verificatie een nieuw document.`;
    case "verlopen":
      return `Je document voor werken in ${landNaamNl} is verlopen. Upload bij Verificatie een geldig document.`;
  }
}

/** "2027-03-31" (een datumveld) → het einde van die dag; null als het geen echte datum is. */
export function geldigTotDag(v: unknown): { jaar: number; maand: number; dag: number } | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const jaar = Number(m[1]);
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) return null;
  return { jaar, maand, dag };
}
