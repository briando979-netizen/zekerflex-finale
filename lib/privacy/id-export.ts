// ---------------------------------------------------------------------------
// De eigen ID-gegevens van een werker in de AVG-export (art. 15/20). Puur bestand, geen prisma: kiest uit een
// IdentityVerification-rij alleen de toegestane velden (whitelist, geen blacklist) en is de ENIGE plek waar die keuze
// gemaakt wordt (lib/privacy/export.ts gebruikt alleen dit).
//
// Wel: aanbieder, datum, status, uitslag, documentsoort, land, naam, geboortedatum, vervaldatum en de laatste tekens van
// het documentnummer (zoals de controle ze zelf bewaart: 3), plus welke foto's er zijn.
// NOOIT: BSN, id_number, MRZ-tekst (ook niet het vrije veld), volledig documentnummer, hashes (documentNumberHash, bsnHash,
// bsnVoorstelHash), iets van de chip (lib/kyc/chip/), gezichtsscores en drempels, teamnotities en rawPayload zelf.
// De foto's zelf zitten niet in de JSON-export; hier staat alleen welke kanten er zijn.
// ---------------------------------------------------------------------------

export interface IdControleRij {
  provider?: unknown;
  status?: unknown;
  decisionStatus?: unknown;
  documentType?: unknown;
  verifiedAt?: unknown;
  expiresAt?: unknown;
  createdAt?: unknown;
  rawPayload?: unknown;
}

export interface IdControleExport {
  aanbieder: string | null;
  datum: Date | string | null;
  status: string | null;
  uitslag: string | null;
  geverifieerdOp: Date | string | null;
  documentsoort: string | null;
  land: string | null;
  naam: string | null;
  geboortedatum: string | null;
  vervaldatum: Date | string | null;
  nummerEindigtOp: string | null;
  foto: { voorkant: boolean; achterkant: boolean; selfie: boolean; selfieVerwijderd: boolean };
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tekst = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const moment = (v: unknown): Date | string | null => (v instanceof Date ? v : typeof v === "string" && v ? v : null);
const ymd = (v: unknown): string | null => {
  const t = tekst(v, 10);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const heeft = (v: unknown): boolean => typeof v === "string" && v.length > 0;

export function idControleVoorExport(rij: IdControleRij): IdControleExport {
  const raw = obj(rij.rawPayload);
  const ids = obj(raw?.uploadIds) ?? {};
  const kopie = obj(raw?.stripeKopie);
  const kopieDoc = obj(kopie?.document);
  const kopieUitslag = obj(kopie?.uitslag);
  // de eigen scan bewaart { naam, uitDeCode, nummerEind }; de Stripe-kopie een rijkere vorm (lib/kyc/stripe-kopie-vorm.ts)
  const eigenDoc = obj(raw?.document);

  const naamKopie = [tekst(kopieDoc?.voornamen), tekst(kopieDoc?.achternaam)].filter(Boolean).join(" ");
  const eind = tekst(kopieDoc?.nummerEind, 16) ?? tekst(eigenDoc?.nummerEind, 16);

  return {
    aanbieder: tekst(rij.provider, 40),
    datum: moment(rij.createdAt),
    status: tekst(rij.status, 40),
    uitslag: tekst(rij.decisionStatus, 80) ?? tekst(kopieUitslag?.document, 80),
    geverifieerdOp: moment(rij.verifiedAt),
    documentsoort: tekst(rij.documentType, 40) ?? tekst(kopieDoc?.soort, 40),
    land: tekst(kopieDoc?.land, 3),
    naam: naamKopie || tekst(eigenDoc?.naam),
    geboortedatum: ymd(kopieDoc?.geboortedatum),
    vervaldatum: ymd(kopieDoc?.vervaldatum) ?? moment(rij.expiresAt),
    nummerEindigtOp: eind ? eind.slice(-4) : null,
    foto: {
      voorkant: heeft(ids.front),
      achterkant: heeft(ids.back),
      selfie: heeft(ids.selfie) || heeft(ids.selfie2),
      selfieVerwijderd: raw?.opgeschoond === true && !heeft(ids.selfie) && !heeft(ids.selfie2),
    },
  };
}
