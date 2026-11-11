// ---------------------------------------------------------------------------
// Een identiteitscontrole leesbaar voor de beheerder (Admin → Gebruikers → <naam>): de foto's
// (voorkant, achterkant, selfie), de controles, het oordeel van de automatische beoordeling en
// de uitslag van MRZ en chip. Puur bestand. Leest alleen wat lib/onboarding/verify.ts bewust in
// rawPayload zet: daar staat nooit een documentnummer, BSN, geboortedatum of pasfoto van de chip
// in (AGENTS.md, ID-documenten). De foto's zelf komen via een eigen, gelogde route
// (app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld).
// ---------------------------------------------------------------------------

/** selfie2: de tweede selfie met een gedraaid hoofd (bewegingscontrole van b3, lib/kyc/gezicht/beweging.ts) */
export type FotoSoort = "front" | "back" | "selfie" | "selfie2";
export const FOTO_SOORTEN: { id: FotoSoort; label: string }[] = [
  { id: "front", label: "Voorkant" },
  { id: "back", label: "Achterkant" },
  { id: "selfie", label: "Selfie" },
  { id: "selfie2", label: "Selfie, hoofd gedraaid" },
];

export const PROVIDER_LABEL: Record<string, string> = {
  AI_LOCAL: "Eigen controle (foto's)",
  STRIPE_IDENTITY: "Stripe Identity",
  DIGITAL_WALLET: "Digitale ID-wallet",
  DIDIT: "Didit (extern)",
  ADMIN_MANUAL: "Handmatig door beheerder",
};

export interface ControleRegel {
  label: string;
  ok: boolean;
  detail: string;
  /** alleen voor de beoordelaar (bijv. "al gebruikt bij een ander account") */
  intern: boolean;
}

export interface IdControleWeergave {
  /** welke foto's er bij ons staan (alleen bij de eigen controle) */
  fotos: FotoSoort[];
  regels: ControleRegel[];
  ai: { oordeel: string; zekerheid: number | null; redenen: string[] } | null;
  beeld: { aan: boolean; samenvatting: string[] };
  mrz: string[];
  chip: string[];
  overig: string[];
  /** Stripe Identity: de sessie (de foto's staan bij Stripe) */
  stripe: { sessieId: string; naamOpDocument: string | null; naamKlopt: boolean | null; reden: string | null } | null;
  /** de eigen gezichtscontrole (lib/kyc/gezicht, b3): pasfoto op het document tegen de selfie */
  gezicht: { oordeel: string; procent: number | null; technisch: boolean; automatisch: boolean; beweging: string | null } | null;
}

const GEZICHT_OORDEEL: Record<string, string> = {
  zelfde: "zelfde persoon",
  twijfel: "twijfel",
  anders: "lijkt een ander persoon",
  onbruikbaar: "niet te meten (foto onbruikbaar)",
};

// rawPayload.gezicht.beweging.oordeel: draaide het hoofd echt op de tweede selfie (tegen een foto of scherm als selfie)
const BEWEGING_OORDEEL: Record<string, string> = {
  ok: "hoofd echt gedraaid",
  "niet-gedraaid": "hoofd niet gedraaid (mogelijk een foto of scherm)",
  onnatuurlijk: "onnatuurlijke draai",
  "niet-recht": "eerste selfie niet recht van voren",
  "andere-persoon": "tweede selfie lijkt een ander persoon",
  "geen-gezicht": "geen gezicht op de tweede selfie",
  "te-onzeker": "te onzeker om te beoordelen",
  "niet-aangeleverd": "geen tweede selfie meegestuurd",
  "niet-beoordeeld": "niet beoordeeld",
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
const jaNee = (v: unknown, ja: string, nee: string): string | null => (v === true ? ja : v === false ? nee : null);

const OORDEEL: Record<string, string> = { approved: "goedgekeurd", needs_review: "laat een mens kijken", rejected: "afgekeurd" };
const WERKRECHT: Record<string, string> = { vrij: "mag vrij werken (EU/EER/CH)", vergunning: "heeft een werkvergunning nodig", onbekend: "onbekend" };
const LEEFTIJD: Record<string, string> = { volwassen: "18 jaar of ouder", minderjarig: "jonger dan 18", onbekend: "onbekend" };

export function idControleWeergave(provider: string, rawPayload: unknown, sessionId: string | null = null, faceMatchScore: number | null = null): IdControleWeergave {
  const p = obj(rawPayload) ?? {};
  const ids = obj(p.uploadIds) ?? {};
  const fotos = (["front", "back", "selfie", "selfie2"] as const).filter((k) => typeof ids[k] === "string" && (ids[k] as string).length > 0);

  const regels: ControleRegel[] = Array.isArray(p.checks)
    ? (p.checks as unknown[]).flatMap((c) => {
        const r = obj(c);
        const label = tekst(r?.label);
        return r && label ? [{ label, ok: r.ok === true, detail: tekst(r.detail) ?? "", intern: r.intern === true }] : [];
      })
    : [];

  const aiObj = obj(p.ai);
  const ai = aiObj
    ? {
        oordeel: OORDEEL[String(aiObj.verdict)] ?? String(aiObj.verdict ?? "onbekend"),
        zekerheid: typeof aiObj.confidence === "number" ? Math.round(aiObj.confidence * 100) / 100 : null,
        redenen: Array.isArray(aiObj.reasons) ? (aiObj.reasons as unknown[]).map(tekst).filter((x): x is string => Boolean(x)).slice(0, 6) : [],
      }
    : null;

  const v = obj(p.vision);
  const samenvatting: string[] = [];
  // lib/kyc/vision.ts VisionReview: { available, document: { plausible, confidence, concerns }, face: { samePerson, faceMatchConfidence, looksLive, livenessConfidence, concerns }, model, error }
  if (v) {
    const doc = obj(v.document);
    const face = obj(v.face);
    const procent = (x: unknown) => (typeof x === "number" ? ` (${Math.round(x * 100)}%)` : "");
    const zorgen = (x: unknown) => (Array.isArray(x) ? (x as unknown[]).map(tekst).filter((y): y is string => Boolean(y)).slice(0, 4) : []);
    if (v.available === false) samenvatting.push("Beeldcontrole stond uit of was niet bereikbaar");
    if (doc) {
      const echt = jaNee(doc.plausible, "Document ziet er echt uit", "Document lijkt niet echt");
      if (echt) samenvatting.push(`${echt}${procent(doc.confidence)}`);
      for (const z of zorgen(doc.concerns)) samenvatting.push(`Let op: ${z}`);
    }
    if (face) {
      const zelfde = jaNee(face.samePerson, "Selfie is dezelfde persoon als op het document", "Selfie lijkt een ander persoon");
      if (zelfde) samenvatting.push(`${zelfde}${procent(face.faceMatchConfidence)}`);
      const levend = jaNee(face.looksLive, "Selfie lijkt een echte persoon (geen foto van een foto)", "Selfie lijkt een foto van een foto of scherm");
      if (levend) samenvatting.push(`${levend}${procent(face.livenessConfidence)}`);
      for (const z of zorgen(face.concerns)) samenvatting.push(`Let op: ${z}`);
    }
    const model = tekst(v.model);
    if (model) samenvatting.push(`Model: ${model}`);
    const fout = tekst(v.error);
    if (fout) samenvatting.push(`Beeldcontrole: ${fout}`);
  }

  const m = obj(p.mrz);
  const mrz = m
    ? [
        jaNee(m.geldig, "MRZ gelezen en geldig", "MRZ niet geldig"),
        jaNee(m.volledig, "volledig gelezen", "niet volledig gelezen"),
        jaNee(m.nummerKlopt, "documentnummer klopt met wat is ingevuld", "documentnummer klopt niet met wat is ingevuld"),
        jaNee(m.naamKlopt, "naam klopt", "naam klopt niet"),
        jaNee(m.verlopen, "document is verlopen", "document is niet verlopen"),
        tekst(m.vervaldatum) ? `geldig tot ${tekst(m.vervaldatum)}` : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  const c = obj(p.chip);
  const chip = c
    ? [
        jaNee(c.echt, "chip is echt (handtekening en keten kloppen)", "chip niet bevestigd als echt"),
        tekst(c.land) ? `land: ${tekst(c.land)}` : null,
        jaNee(c.nummerKlopt, "documentnummer op de chip klopt", "documentnummer op de chip klopt niet"),
        jaNee(c.naamKlopt, "naam op de chip klopt", "naam op de chip klopt niet"),
        c.andersDanFoto === true ? "chip hoort bij een ander document dan op de foto" : null,
        c.elders === true ? "deze chip is ook bij een ander account gebruikt" : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  const overig = [
    tekst(p.werkrecht) ? `Werkrecht: ${WERKRECHT[String(p.werkrecht)] ?? String(p.werkrecht)}` : null,
    tekst(p.leeftijd) ? `Leeftijd: ${LEEFTIJD[String(p.leeftijd)] ?? String(p.leeftijd)}` : null,
    p.dubbelDocument === true ? "Dit document is al bij een ander account gebruikt" : null,
    p.viaTweedeToestel === true ? "Ingestuurd via een tweede toestel (verder op je telefoon)" : null,
    tekst(p.reason) ? `Reden: ${tekst(p.reason)}` : null,
  ].filter((x): x is string => Boolean(x));

  const stripeSessie = sessionId ?? tekst(p.sessionId);
  const stripe =
    provider === "STRIPE_IDENTITY" && stripeSessie
      ? {
          sessieId: stripeSessie,
          naamOpDocument: tekst(p.nameOnDocument),
          naamKlopt: typeof p.nameOk === "boolean" ? p.nameOk : null,
          reden: tekst(p.reason),
        }
      : null;

  // rawPayload.gezicht = { oordeel, score (cosinus 0-1), technisch, automatisch, ms, beweging: { oordeel, verschil } }; anders de kolom faceMatchScore
  const g = obj(p.gezicht);
  const bw = obj(g?.beweging);
  const bwVerschil = typeof bw?.verschil === "number" ? ` (draai ${Math.round(bw.verschil * 100)}%)` : "";
  const score = typeof g?.score === "number" ? g.score : typeof faceMatchScore === "number" ? faceMatchScore : null;
  const gezicht =
    g || score != null
      ? {
          oordeel: g ? (GEZICHT_OORDEEL[String(g.oordeel)] ?? String(g.oordeel ?? "onbekend")) : "score bekend",
          procent: score != null ? Math.round(score * 100) : null,
          technisch: g?.technisch === true,
          automatisch: g?.automatisch === true,
          beweging: bw ? `${BEWEGING_OORDEEL[String(bw.oordeel)] ?? String(bw.oordeel ?? "onbekend")}${bw.oordeel === "ok" || bw.oordeel === "niet-gedraaid" || bw.oordeel === "onnatuurlijk" ? bwVerschil : ""}` : null,
        }
      : null;

  return { fotos, regels, ai, beeld: { aan: v?.available === true, samenvatting }, mrz, chip, overig, stripe, gezicht };
}

/** De foto-upload van een controle, of null (geen eigen controle, of al opgeruimd na 30 dagen). */
export function fotoUploadId(rawPayload: unknown, soort: FotoSoort): string | null {
  const ids = obj(obj(rawPayload)?.uploadIds);
  const id = ids?.[soort];
  return typeof id === "string" && id ? id : null;
}

/** De sessie in het Stripe-dashboard (daar staan de foto's van een Stripe-controle). */
export const stripeSessieUrl = (sessieId: string): string => `https://dashboard.stripe.com/identity/verification-sessions/${encodeURIComponent(sessieId)}`;
