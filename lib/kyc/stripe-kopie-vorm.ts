// ---------------------------------------------------------------------------
// Een kopie van een Stripe-controle bij ons (14 nov 2026, eigenaar: "haal alle documenten en gegevens uit de oude
// Stripe-account en zet het bij de gebruiker neer bij admin"). Puur: welke velden uit het verificatierapport mogen mee, en
// hoe de kopie in IdentityVerification.rawPayload komt, op dezelfde plek als bij de eigen ID-scan (uploadIds: front, back,
// selfie). Daardoor tonen Beheer, het wissen van een account (lib/privacy/anonymize.ts leest uploadIds) en de nachtelijke
// opschoning (lib/privacy/kyc-fotos.ts: selfies na 30 dagen weg, documentkanten blijven) de kopie zonder eigen regels.
// NOOIT: id_number, een BSN of persoonsnummer (AGENTS.md). Het documentnummer alleen als hash plus de laatste 3 tekens,
// zoals bij de eigen scan. Geen ruwe rapport-JSON.
// ---------------------------------------------------------------------------

export const KOPIE_FOTOS = ["front", "back", "selfie"] as const;
export type KopieFoto = (typeof KOPIE_FOTOS)[number];

export interface KopieDocument {
  soort: "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE" | null;
  land: string | null;
  voornamen: string | null;
  achternaam: string | null;
  geboortedatum: string | null;
  vervaldatum: string | null;
  nummerEind: string | null;
}

export interface StripeKopie {
  /** wanneer gekopieerd (ISO) */
  at: string;
  /** de sessie bij Stripe (geen capability-URL) */
  sessieId: string;
  document: KopieDocument | null;
  /** de uitslag van Stripe: de sessie en het documentoordeel, met de foutcode als die er was */
  uitslag: { sessie: string | null; document: string | null; fout: string | null };
  /** waarom een foto ontbreekt (redactie, 48-uursgrens, paspoort zonder achterkant); per foto */
  ontbreekt: Partial<Record<KopieFoto, string>>;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const pad = (n: number) => String(n).padStart(2, "0");

/** {day, month, year} van Stripe naar "YYYY-MM-DD"; onvolledig of onzin = null. */
export function stripeDatum(v: unknown): string | null {
  const d = obj(v);
  const [j, m, dag] = [d?.year, d?.month, d?.day].map((x) => (typeof x === "number" && Number.isInteger(x) ? x : null));
  if (!j || !m || !dag || m < 1 || m > 12 || dag < 1 || dag > 31 || j < 1900 || j > 2100) return null;
  return `${j}-${pad(m)}-${pad(dag)}`;
}

const SOORT: Record<string, KopieDocument["soort"]> = { passport: "PASSPORT", id_card: "ID_CARD", driving_license: "DRIVERS_LICENSE" };

/**
 * Alleen de toegestane velden uit report.document. Het nummer komt los terug (voor de hash en de laatste 3 tekens) en wordt
 * door de aanroeper niet bewaard. id_number en alles daarbuiten lezen we niet eens.
 */
export function kopieDocument(rapport: unknown): { document: KopieDocument | null; nummer: string | null } {
  const doc = obj(obj(rapport)?.document);
  if (!doc) return { document: null, nummer: null };
  const nummer = tekst(doc.number);
  const type = tekst(doc.type);
  return {
    document: {
      soort: type && Object.hasOwn(SOORT, type) ? (SOORT[type] ?? null) : null,
      land: tekst(doc.issuing_country)?.slice(0, 3) ?? null,
      voornamen: tekst(doc.first_name),
      achternaam: tekst(doc.last_name),
      geboortedatum: stripeDatum(doc.dob),
      vervaldatum: stripeDatum(doc.expiration_date),
      nummerEind: nummer ? nummer.replace(/\s+/g, "").slice(-3) : null,
    },
    nummer,
  };
}

/** De uitslag van Stripe zonder inhoud: de status van de sessie, het oordeel over het document en de foutcode. */
export function kopieUitslag(sessie: unknown, rapport: unknown): StripeKopie["uitslag"] {
  const doc = obj(obj(rapport)?.document);
  return {
    sessie: tekst(obj(sessie)?.status),
    document: tekst(doc?.status),
    fout: tekst(obj(doc?.error)?.code),
  };
}

/** Wat er al gekopieerd is: de upload-id's per foto en de kopie zelf (null als er nog geen is). */
export function kopieStand(rawPayload: unknown): { uploadIds: Partial<Record<KopieFoto, string>>; kopie: StripeKopie | null } {
  const raw = obj(rawPayload);
  const ids = obj(raw?.uploadIds) ?? {};
  const uploadIds: Partial<Record<KopieFoto, string>> = {};
  for (const k of KOPIE_FOTOS) {
    const v = ids[k];
    if (typeof v === "string" && v) uploadIds[k] = v;
  }
  const k = obj(raw?.stripeKopie);
  return { uploadIds, kopie: k && typeof k.at === "string" ? (k as unknown as StripeKopie) : null };
}

/** Is deze controle helemaal gekopieerd: een kopie, en elke foto er of met een reden waarom niet? */
export function kopieAf(rawPayload: unknown): boolean {
  const { uploadIds, kopie } = kopieStand(rawPayload);
  return Boolean(kopie) && KOPIE_FOTOS.every((f) => Boolean(uploadIds[f]) || Boolean(kopie?.ontbreekt[f]));
}

/** De nieuwe rawPayload: alles wat er stond blijft, met de foto's erbij (bestaande worden nooit vervangen) en de kopie. */
export function metKopie(rawPayload: unknown, nieuweIds: Partial<Record<KopieFoto, string>>, kopie: StripeKopie): Record<string, unknown> {
  const raw = obj(rawPayload) ?? {};
  const ids = { ...(obj(raw.uploadIds) ?? {}) };
  for (const [k, v] of Object.entries(nieuweIds)) if (v && typeof ids[k] !== "string") ids[k] = v;
  return { ...raw, uploadIds: ids, stripeKopie: kopie };
}

/** Wat de Stripe-sync moet bewaren als hij rawPayload opnieuw schrijft (lib/kyc/stripe-identity.ts): de foto's en de kopie. */
export function behoudKopie(rawPayload: unknown): { uploadIds?: Record<string, unknown>; stripeKopie?: unknown } {
  const raw = obj(rawPayload);
  return {
    ...(obj(raw?.uploadIds) ? { uploadIds: obj(raw?.uploadIds) as Record<string, unknown> } : {}),
    ...(raw?.stripeKopie ? { stripeKopie: raw.stripeKopie } : {}),
  };
}

/** De regel in Beheer bij een gekopieerde Stripe-controle; de datums opgemaakt door de aanroeper (Amsterdamse tijd). */
export function kopieRegel(k: StripeKopie, fmt: { datumTijd: (iso: string) => string; datum: (ymd: string) => string }): string {
  const d = k.document;
  const delen = [
    `Uit Stripe, gekopieerd op ${fmt.datumTijd(k.at)}`,
    [d?.voornamen, d?.achternaam].filter(Boolean).join(" "),
    d?.geboortedatum ? `geboren ${fmt.datum(d.geboortedatum)}` : "",
    d?.land ?? "",
    d?.vervaldatum ? `geldig tot ${fmt.datum(d.vervaldatum)}` : "",
    d?.nummerEind ? `nummer eindigt op ${d.nummerEind}` : "",
    k.uitslag.document ? `Stripe: ${k.uitslag.document}` : "",
  ].filter(Boolean);
  return `${delen.join(" · ")}. `;
}
