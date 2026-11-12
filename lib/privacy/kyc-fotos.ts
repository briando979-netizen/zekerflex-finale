// ---------------------------------------------------------------------------
// De foto's van een eigen ID-controle (IdentityVerification.rawPayload.uploadIds: front, back, selfie, selfie2) bij
// het opschonen na de bewaartermijn (lib/privacy/sweep.ts). Puur bestand.
//  - De selfies zijn biometrie: die gaan na 30 dagen mét het bestand weg (retentie "kyc", lib/privacy/retention.ts).
//  - Voor- en achterkant zijn de kopie van het identiteitsbewijs (identificatieplicht van de werkgever): die blijven,
//    en hun koppeling ook. Anders kan Beheer ze niet meer tonen en vindt het wissen van het account
//    (lib/privacy/anonymize.ts leest uploadIds) ze niet terug, en blijven de bestanden voorgoed staan.
// Een opgeschoonde controle krijgt `opgeschoond: true`, zodat de nachtelijke ronde hem niet steeds opnieuw ziet.
// ---------------------------------------------------------------------------

export const KYC_BIOMETRIE = ["selfie", "selfie2"] as const;
export const KYC_DOCUMENT = ["front", "back"] as const;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Is deze controle al opgeschoond (dan alleen nog de koppeling van voor- en achterkant)? */
export function isOpgeschoond(rawPayload: unknown): boolean {
  return obj(rawPayload)?.opgeschoond === true;
}

/** Alle upload-id's van de foto's van een controle. */
export function kycUploadIds(rawPayload: unknown): string[] {
  const ids = obj(obj(rawPayload)?.uploadIds) ?? {};
  return Object.values(ids).filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Splitst de foto's van een controle: de selfies (weg) en de documentkanten (blijven, als koppeling). De nieuwe
 * rawPayload bevat alleen de markering en de koppeling van voor- en achterkant: geen naam, nummer of score meer.
 */
export function kycOpschonen(rawPayload: unknown): { selfies: string[]; nieuwePayload: { opgeschoond: true; uploadIds?: Record<string, string> } } {
  const ids = obj(obj(rawPayload)?.uploadIds) ?? {};
  const selfies = KYC_BIOMETRIE.map((k) => ids[k]).filter((v): v is string => typeof v === "string" && v.length > 0);
  const houden: Record<string, string> = {};
  for (const k of KYC_DOCUMENT) {
    const v = ids[k];
    if (typeof v === "string" && v.length > 0) houden[k] = v;
  }
  return { selfies, nieuwePayload: Object.keys(houden).length > 0 ? { opgeschoond: true, uploadIds: houden } : { opgeschoond: true } };
}
