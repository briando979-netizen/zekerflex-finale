import { checkVies } from "@/lib/integrations/vies";
import { createHash } from "node:crypto";
import { ComplianceDocKind, KycStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { geocodeThuisbasis } from "@/lib/geo/thuisbasis";
import { registerFreelancerCompany } from "@/lib/company/registration";
import { storeUpload } from "@/lib/storage/local";
import { runVisionReview } from "@/lib/kyc/vision";
import { gezichtControle } from "@/lib/kyc/gezicht/controle";
import { GEZICHT_DREMPEL } from "@/lib/kyc/gezicht/vergelijk";
import { gezichtBeslist, redenenNietAutomatisch, type AutoFeiten } from "@/lib/onboarding/auto-redenen";
import { reeksSamenvatting, wisReeks } from "@/lib/kyc/gezicht/reeks-opslag";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { featureEnabled } from "@/lib/flags";
import { leesMrzVanFoto } from "@/lib/kyc/mrz-lezen";
import { zelfdeNummer, type MrzUitslag } from "@/lib/kyc/mrz";
import { documentNaamPast } from "@/lib/kyc/document-naam";
import { chipLezing, wisChipGegevens } from "@/lib/kyc/chip/sessie";
import { LEEFTIJD_TEKST, WERKRECHT_TEKST, leeftijdsgroep, werkrechtUitMrz } from "@/lib/kyc/werkrecht";
import { documentHash } from "@/lib/kyc/document-hash";
import { redenTekst } from "@/lib/onboarding/redenen";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { consumeVerifiedWalletAttempt } from "@/lib/kyc/wallet";
import { flagIbanChanged } from "@/lib/compliance/documents";
import { eisIbanBevestiging } from "@/lib/fiscal/iban-bevestiging";
import { schoonIban } from "@/lib/onboarding/velden";
import { alertOwnerLater } from "@/lib/ops/alert";
import { runAfter } from "@/lib/run-after";
import { meldIdGeverifieerd } from "@/lib/onboarding/id-geverifieerd";
import { aiReviewOverslaan, aiReviewUitslag, laadAiReviewRem, REM_DUUR_MS, REM_NA } from "@/lib/onboarding/ai-review-rem";
import { fotoBron } from "@/lib/kyc/foto-bron";
import { fotoMaat } from "@/lib/kyc/foto-maat";

// ---------------------------------------------------------------------------
// Self-serve freelancer onboarding verification.
//
//  1. Geocode the home base (PDOK in NL, OpenStreetMap abroad: lib/geo/thuisbasis.ts).
//  2. Validate the KVK against the Handelsregister (KVKBase).
//  3. Run the built-in ID checker over the uploaded document:
//     deterministic checks (name match, document-number format, expiry) +
//     a local-LLM authenticity review that produces the human explanation.
//  4. Approve automatically when everything lines up; otherwise leave it
//     "in review" with concrete reasons — never a dead end.
//
// Capture is three photos in one go — front, back, selfie — not one generic
// upload. The front image also satisfies the separate "Identiteitsbewijs"
// compliance-document requirement (lib/compliance/documents.ts) so a
// freelancer is never asked to upload the same ID twice.
// ---------------------------------------------------------------------------

export type DocKind = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";

export interface CapturedImage {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface OnboardingInput {
  userId: string;
  kvkNumber: string;
  /** EU btw-nummer instead of KVK (optional) */
  vatNumber?: string | undefined;
  postalCode: string;
  /** land van de thuisbasis (ISO, standaard NL); niet het fiscale land, zie lib/geo/thuisland.ts */
  country?: string | undefined;
  /** woonplaats, alleen nodig voor een thuisbasis in het buitenland */
  city?: string | undefined;
  houseNumber?: string | undefined;
  payoutIban?: string | undefined;
  /** Bevestigingscode bij een gewijzigd IBAN (mail of 2FA). */
  ibanCode?: string | undefined;
  documentType: DocKind;
  documentNumber: string;
  documentExpiry: string; // yyyy-mm-dd
  nameOnDocument: string;
  /** `selfie2`: de tweede selfie met een gedraaid hoofd (bewegingscontrole, lib/kyc/gezicht/beweging.ts); zonder die foto keurt de gezichtscontrole nooit zelf goed */
  files: { front: CapturedImage; back: CapturedImage; selfie: CapturedImage; selfie2?: CapturedImage | undefined };
  /**
   * De foto's kwamen van een tweede toestel ("verder op je telefoon", lib/kyc/overdracht.ts).
   * Dan beslist altijd een mens: een doorgestuurde link kan anders iemands eigen ID en selfie
   * aan een vreemd account koppelen (review H1).
   */
  viaTweedeToestel?: boolean | undefined;
  /**
   * Signalen voor de beoordelaar bij "verder op je telefoon" (review H1/M2, alleen intern):
   * telefoon en laptop op hetzelfde netwerk, hoe vaak een telefoon "dit is niet mijn account"
   * koos (dan beslist ook zonder telefoonfoto's een mens), en of er na een overdracht losse
   * foto's kwamen in plaats van die van de telefoon.
   */
  tweedeToestel?: { zelfdeNetwerk: boolean | null; geweigerd: number; zonderVlag: boolean } | undefined;
}

export interface OnboardingResult {
  kycStatus: KycStatus;
  kvkValid: boolean;
  outcome: "verified" | "in_review" | "rejected";
  companyName: string | null;
  /**
   * De controles. `intern` (review N4): alleen voor de beoordelaar (rawPayload), nooit
   * terug naar de werker: "al gebruikt bij een ander account" verraadt anders of
   * iemand met dat document op ZekerFlex staat.
   */
  checks: { label: string; ok: boolean; detail: string; intern?: boolean }[];
  reasons: string[];
  summary: string;
}

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "ten", "ter", "het", "'t", "op", "aan", "in", "te",
]);

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2 && !TUSSENVOEGSELS.has(t));
}

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

const DOC_PATTERNS: Record<DocKind, RegExp> = {
  PASSPORT: /^[A-Za-z0-9]{9}$/,
  ID_CARD: /^[A-Za-z0-9]{9}$/,
  DRIVERS_LICENSE: /^[0-9]{9,10}$/,
};

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

interface AiVerdict {
  verdict: "approved" | "needs_review" | "rejected";
  confidence: number;
  reasons: string[];
  summary: string;
}

async function aiAuthenticityReview(params: {
  accountName: string;
  nameOnDocument: string;
  kvkLegalName: string | null;
  kvkTradeName: string | null;
  kvkStatus: string;
  documentType: DocKind;
  documentNumber: string;
  documentExpiry: string;
  file: { mimeType: string; sizeBytes: number; filename: string };
  deterministic: { label: string; ok: boolean; detail: string }[];
}): Promise<AiVerdict> {
  const system = `Je bent de ingebouwde identiteitscontroleur van ZekerFlex. Je beoordeelt of een
zzp'er die zich aanmeldt betrouwbaar geverifieerd kan worden op basis van de aangeleverde gegevens
en de uitkomst van de automatische controles. Je hebt GEEN toegang tot de beeldinhoud van het
document; oordeel op basis van consistentie, formaat en plausibiliteit.

Geef terug als JSON: { "verdict": "approved" | "needs_review" | "rejected", "confidence": 0..1,
"reasons": string[] (kort, Nederlands), "summary": string (1 zin, Nederlands) }.

Richtlijnen:
- "approved" alleen als naam, KVK en document consistent zijn en alle deterministische checks slagen.
- "rejected" bij duidelijke tegenstrijdigheden (verlopen document, naam matcht totaal niet, KVK uitgeschreven).
- Anders "needs_review".`;

  const payload = {
    accountName: params.accountName,
    nameOnDocument: params.nameOnDocument,
    kvkLegalName: params.kvkLegalName,
    kvkTradeName: params.kvkTradeName,
    kvkStatus: params.kvkStatus,
    documentType: params.documentType,
    documentNumber: params.documentNumber,
    documentExpiry: params.documentExpiry,
    file: params.file,
    automaticChecks: params.deterministic,
    today: new Date().toISOString().slice(0, 10),
  };

  const nietBeschikbaar: AiVerdict = {
    verdict: "needs_review",
    confidence: 0,
    reasons: ["De automatische beoordeling was tijdelijk niet beschikbaar; een controleur kijkt ernaar."],
    summary: "In behandeling — automatische beoordeling niet beschikbaar.",
  };
  // gaf de AI de laatste keren geen antwoord, dan niet nog eens 8 s wachten (lib/onboarding/ai-review-rem.ts);
  // de rem staat ook in de database, anders begint hij na elke uitrol opnieuw
  await laadAiReviewRem();
  if (aiReviewOverslaan()) return nietBeschikbaar;

  try {
    const verdict = await chatJson<AiVerdict>({
      purpose: "kyc-review",
      temperature: 0.1,
      maxTokens: 400,
      // This blocks a live onboarding submission — fail once, fast, rather
      // than retrying for up to LLM_RETRY_MAX_WAIT_MS. No local LLM
      // configured/reachable (e.g. this deploy has no Sovereign Box) must
      // degrade in well under a second, not ~40s+, before falling through
      // to the catch below.
      timeoutMs: 8_000,
      retry: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
    });
    aiReviewUitslag(true);
    return {
      verdict: ["approved", "needs_review", "rejected"].includes(verdict.verdict)
        ? verdict.verdict
        : "needs_review",
      confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
      reasons: Array.isArray(verdict.reasons) ? verdict.reasons.slice(0, 6).map(String) : [],
      summary: typeof verdict.summary === "string" ? verdict.summary : "",
    };
  } catch (err) {
    // één waarschuwing als de rem dichtgaat, niet bij elke werker (foutenlogboek 12 nov: 12x op een dag)
    if (aiReviewUitslag(false) === "dicht") {
      logger.warn(`kyc ai review: ${REM_NA}x geen antwoord, ${REM_DUUR_MS / 3_600_000} uur overgeslagen`, { error: (err as Error).message });
    } else {
      logger.info("kyc ai review unavailable, deferring to human", { error: (err as Error).message });
    }
    return nietBeschikbaar;
  }
}

interface FreelancerBaseResult {
  freelancerProfileId: string;
  checks: OnboardingResult["checks"];
  skipKvk: boolean;
  kvkValid: boolean;
  companyName: string | null;
  companyTradeName: string | null;
  companyStatus: string;
}

/** Het IBAN uit de fiscale gegevens (waar "Bankrekening bevestigen" het ook bewaart), of null. */
async function ibanUitFiscaal(userId: string): Promise<string | null> {
  try {
    const { getFiscal } = await import("@/lib/fiscal/store");
    return schoonIban((await getFiscal(userId)).iban);
  } catch {
    return null;
  }
}

/**
 * Geocode + create/update the FreelancerProfile + (optional) KVK check —
 * shared by both the photo-capture and digital-wallet onboarding paths,
 * which differ only in how the identity itself gets proven.
 */
async function ensureFreelancerBase(input: {
  userId: string;
  existingProfileId?: string | undefined;
  kvkNumber: string;
  /** EU btw-nummer instead of a KVK number (e.g. a self-employed worker from Poland) */
  vatNumber?: string | undefined;
  postalCode: string;
  /** land van de thuisbasis (ISO, standaard NL); niet het fiscale land, zie lib/geo/thuisland.ts */
  country?: string | undefined;
  /** woonplaats, alleen nodig voor een thuisbasis in het buitenland */
  city?: string | undefined;
  houseNumber?: string | undefined;
  payoutIban?: string | undefined;
  ibanCode?: string | undefined;
  /** De IBAN-bevestiging is al gevraagd (de code is eenmalig: niet nog eens controleren). */
  ibanAlBevestigd?: boolean | undefined;
}): Promise<FreelancerBaseResult> {
  const checks: OnboardingResult["checks"] = [];

  // Vóór elke schrijfactie: een buitenlands adres dat OSM niet kent, stopt hier met een eerlijke fout.
  const geo = await geocodeThuisbasis({
    land: input.country ?? "NL",
    postcode: input.postalCode,
    plaats: input.city,
    huisnummer: input.houseNumber,
  });
  checks.push({
    label: "Thuisbasis",
    ok: !geo.approximate,
    detail: geo.approximate
      ? "Postcode kon niet exact worden gelokaliseerd; je kunt dit later bijwerken."
      : [[geo.street, input.houseNumber].filter(Boolean).join(" "), geo.city].filter(Boolean).join(", ") || geo.postalCode,
  });

  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  const vat = !cleanKvk && input.vatNumber?.trim() ? await checkVies(input.vatNumber) : null;
  if (vat?.status === "malformed") {
    throw AppError.validation("Dat btw-nummer klopt niet. Begin met de landcode, bijvoorbeeld PL1234567890 of NL123456789B01.");
  }
  if (vat) {
    const taken = await prisma.freelancerProfile.findFirst({ where: { vatNumber: vat.vatNumber, userId: { not: input.userId } }, select: { id: true } });
    if (taken) throw AppError.conflict("Dit btw-nummer is al gekoppeld aan een ander account. Neem contact op met support.");
  }
  const vatFields = vat
    ? { vatNumber: vat.vatNumber, vatValid: vat.status === "valid", country: vat.countryCode === "EL" ? "GR" : vat.countryCode === "XI" ? "GB" : vat.countryCode }
    : {};
  const cleanIban = schoonIban(input.payoutIban);
  let freelancerProfileId = input.existingProfileId;
  if (!freelancerProfileId) {
    // Het IBAN kan al bij "Bankrekening bevestigen" zijn ingevuld, voordat dit profiel bestond:
    // de uitbetaling leest het van het profiel, dus nemen we het hier over.
    const startIban = cleanIban ?? (await ibanUitFiscaal(input.userId));
    const created = await prisma.freelancerProfile.create({
      data: {
        userId: input.userId,
        ...vatFields,
        kvkNumber: cleanKvk || (vat ? `vat-${vat.vatNumber}` : `pending-${input.userId.slice(0, 8)}`),
        // zonder IBAN (het wordt bij "Bankrekening bevestigen" gevraagd) blijft het veld leeg
        ...(startIban ? { payoutIban: startIban } : {}),
        homeLatitude: geo.latitude,
        homeLongitude: geo.longitude,
        homePostalCode: geo.postalCode,
      },
      select: { id: true },
    });
    freelancerProfileId = created.id;
  } else {
    // Zonder IBAN verandert er niets aan het bestaande rekeningnummer: dat staat bij
    // "Bankrekening bevestigen" en komt hier niet meer langs.
    let ibanChanged = false;
    let schrijfIban = cleanIban;
    if (cleanIban) {
      const existing = await prisma.freelancerProfile.findUnique({
        where: { id: freelancerProfileId },
        select: { payoutIban: true },
      });
      // Een gewijzigd bestaand IBAN vraagt een tweede bewijs (mailcode of 2FA), net als
      // in /api/me/fiscal; een eerste IBAN blijft vrij. Vóór elke schrijfactie; gooit
      // IbanBevestigingFout (423) die de route teruggeeft.
      if (!input.ibanAlBevestigd) await eisIbanBevestiging(input.userId, existing?.payoutIban, cleanIban, input.ibanCode);
      // Only a CHANGE to an already-set IBAN needs re-verification — the first
      // time this profile ever gets one (fresh onboarding) is not a "change".
      ibanChanged = Boolean(existing?.payoutIban) && existing!.payoutIban !== cleanIban;
    } else {
      const bestaand = await prisma.freelancerProfile.findUnique({ where: { id: freelancerProfileId }, select: { payoutIban: true } });
      if (!bestaand?.payoutIban) schrijfIban = await ibanUitFiscaal(input.userId);
    }
    await prisma.freelancerProfile.update({
      where: { id: freelancerProfileId },
      data: {
        ...vatFields,
        ...(schrijfIban ? { payoutIban: schrijfIban } : {}),
        homeLatitude: geo.latitude,
        homeLongitude: geo.longitude,
        homePostalCode: geo.postalCode,
      },
    });
    if (ibanChanged) await flagIbanChanged(input.userId).catch(() => undefined);
  }

  const skipKvk = cleanKvk.length === 0 && !vat;
  let kvkValid = false;
  let companyName: string | null = null;
  let companyTradeName: string | null = null;
  let companyStatus = "ONBEKEND";
  if (vat) {
    // EU btw-nummer: a valid VIES result counts like an active KVK registration.
    // VIES being down is not a failure — it lands in review, never a rejection.
    kvkValid = vat.status === "valid";
    companyName = vat.name;
    companyStatus = vat.status === "valid" ? "ACTIVE" : "ONBEKEND";
    checks.push({
      label: "Btw-nummer (EU, VIES)",
      ok: vat.status === "valid",
      detail:
        vat.status === "valid"
          ? `${vat.vatNumber} geldig${vat.name ? ` — ${vat.name}` : ""}`
          : vat.status === "invalid"
            ? `${vat.vatNumber} is volgens de EU-database (VIES) niet geldig.`
            : `De EU-btw-controle (VIES) was niet bereikbaar; we controleren ${vat.vatNumber} later handmatig.`,
    });
  } else if (skipKvk) {
    checks.push({
      label: "Werkvorm",
      ok: true,
      detail: "Uitzendkracht — geen KVK vereist. Verloning loopt via de payroll.",
    });
  } else {
    try {
      const reg = await registerFreelancerCompany({
        freelancerProfileId,
        kvkNumber: cleanKvk,
        allowInactive: true,
      });
      kvkValid = reg.kvkValid;
      companyName = reg.profile.legalName;
      companyTradeName = reg.profile.tradeName;
      companyStatus = reg.profile.status;
      checks.push({
        label: "KVK Handelsregister",
        ok: kvkValid,
        detail: kvkValid
          ? `${reg.profile.legalName} — actief`
          : `Gevonden maar niet goedgekeurd: ${reg.validation.reasons.join(" ") || "onbekende reden"}`,
      });
    } catch (err) {
      checks.push({
        label: "KVK Handelsregister",
        ok: false,
        detail:
          err instanceof AppError
            ? err.message
            : "KVK-nummer kon niet worden gecontroleerd. Controleer het nummer.",
      });
    }
  }

  return { freelancerProfileId, checks, skipKvk, kvkValid, companyName, companyTradeName, companyStatus };
}

/**
 * Stripe Identity route: save business (KVK or EU btw-nummer), home base and
 * IBAN now; the identity itself is proven on Stripe's page afterwards.
 */
export async function saveFreelancerBase(input: {
  userId: string;
  kvkNumber: string;
  vatNumber?: string | undefined;
  postalCode: string;
  /** land van de thuisbasis (ISO, standaard NL); niet het fiscale land, zie lib/geo/thuisland.ts */
  country?: string | undefined;
  /** woonplaats, alleen nodig voor een thuisbasis in het buitenland */
  city?: string | undefined;
  houseNumber?: string | undefined;
  payoutIban?: string | undefined;
  ibanCode?: string | undefined;
}): Promise<FreelancerBaseResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { freelancerProfile: { select: { id: true } } } });
  if (!user) throw AppError.notFound("Account niet gevonden");
  return ensureFreelancerBase({ ...input, existingProfileId: user.freelancerProfile?.id });
}

/**
 * Leest de MRZ van het document zelf (lib/kyc/mrz-lezen.ts): bij een ID-kaart op
 * de achterkant, bij een paspoort op de pasfotopagina; heeft iemand voor- en
 * achterkant verwisseld, dan proberen we de andere foto. Een rijbewijs heeft
 * geen MRZ. Faalt de OCR, dan is er gewoon geen MRZ-uitslag (nooit een blokkade).
 */
async function leesDocumentMrz(input: OnboardingInput): Promise<MrzUitslag | null> {
  if (input.documentType === "DRIVERS_LICENSE") return null;
  const volgorde = input.documentType === "PASSPORT" ? [input.files.front, input.files.back] : [input.files.back, input.files.front];
  let beste: MrzUitslag | null = null;
  for (const foto of volgorde) {
    try {
      const { uitslag } = await leesMrzVanFoto(foto.bytes);
      if (uitslag?.geldig) return uitslag;
      beste ??= uitslag;
    } catch (err) {
      logger.warn("mrz lezen mislukt", { error: (err as Error).message });
    }
  }
  return beste;
}

const datumNl = (iso: string) => {
  const [j, m, d] = iso.split("-");
  return `${d}-${m}-${j}`;
};

export async function submitFreelancerOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, fullName: true, email: true, kycStatus: true, freelancerProfile: { select: { id: true } } },
  });
  if (!user) throw AppError.notFound("Account niet gevonden");

  const checks: OnboardingResult["checks"] = [];

  // --- file sanity (all three captures) -----------------------------------
  const front = input.files.front;
  const mime = front.mimeType.toLowerCase();
  const imageOk = (f: CapturedImage) => ALLOWED_MIME.has(f.mimeType.toLowerCase()) && f.bytes.length > 8_000;
  const frontOk = imageOk(front);
  const backOk = imageOk(input.files.back);
  const selfieOk = imageOk(input.files.selfie);
  checks.push({
    label: "Documentfoto's (voor-, achterkant, selfie)",
    ok: frontOk && backOk && selfieOk,
    detail:
      frontOk && backOk && selfieOk
        ? `${mime}, ${(
            (front.bytes.length + input.files.back.bytes.length + input.files.selfie.bytes.length) /
            1024
          ).toFixed(0)} kB samen`
        : "Eén of meer foto's zijn niet leesbaar. Gebruik duidelijke, scherpe foto's (JPG, PNG of WebP, min. 8 kB per foto).",
  });
  if (!frontOk || !backOk || !selfieOk) {
    throw AppError.validation(
      "Eén of meer van je foto's is niet leesbaar. Maak de voorkant, achterkant en selfie opnieuw met goed licht.",
    );
  }

  // --- home base + freelancer profile + KVK ------------------------------
  const base = await ensureFreelancerBase({
    userId: user.id,
    existingProfileId: user.freelancerProfile?.id,
    kvkNumber: input.kvkNumber,
    vatNumber: input.vatNumber,
    postalCode: input.postalCode,
    country: input.country,
    city: input.city,
    houseNumber: input.houseNumber,
    payoutIban: input.payoutIban,
    ibanCode: input.ibanCode,
  });
  checks.push(...base.checks);
  const { freelancerProfileId, skipKvk, kvkValid, companyName, companyTradeName, companyStatus } = base;

  // --- deterministic ID checks ---------------------------------------
  const simAccount = nameSimilarity(user.fullName, input.nameOnDocument);
  const simKvk = companyName ? nameSimilarity(companyName, input.nameOnDocument) : 0;
  const nameOk = simAccount >= 0.5 || simKvk >= 0.5;
  checks.push({
    label: "Naam komt overeen",
    ok: nameOk,
    detail: nameOk
      ? "Naam op document komt overeen met je account"
      : "De naam op het document wijkt af van je accountnaam",
  });

  const numOk = DOC_PATTERNS[input.documentType].test(input.documentNumber.trim());
  checks.push({
    label: "Documentnummer",
    ok: numOk,
    detail: numOk ? "Formaat correct" : "Het documentnummer heeft niet het verwachte formaat",
  });

  let expiry = new Date(input.documentExpiry);
  let expiryOk =
    !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() > Date.now() &&
    expiry.getTime() < Date.now() + 16 * 365 * 24 * 3600 * 1000;
  const expiryCheck = {
    label: "Geldigheid document",
    ok: expiryOk,
    detail: expiryOk
      ? `Geldig tot ${expiry.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}`
      : "Het document lijkt verlopen of de datum is ongeldig",
  };
  checks.push(expiryCheck);

  // --- AI authenticity review (text-only) + vision review (photo content) +
  // de MRZ van het document zelf, tegelijk: drie onafhankelijke controles ------
  // (volgorde van de destructuring = volgorde van de beloften)
  const [ai, vision, mrz, chip, gezicht, gezichtAuto] = await Promise.all([
    aiAuthenticityReview({
      accountName: user.fullName,
      nameOnDocument: input.nameOnDocument,
      kvkLegalName: companyName,
      kvkTradeName: companyTradeName,
      kvkStatus: companyStatus,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      documentExpiry: input.documentExpiry,
      file: {
        mimeType: mime,
        sizeBytes: front.bytes.length,
        filename: front.filename,
      },
      deterministic: checks,
    }),
    runVisionReview(input.files),
    leesDocumentMrz(input),
    // de chip, als die net met de app is gelezen (NFC, lib/kyc/chip); een storing blokkeert nooit
    chipLezing(user.id).catch(() => null),
    // de pasfoto op het document tegen de selfie, met een eigen gezichtsmodel op deze server (lib/kyc/gezicht);
    // een storing geeft nooit een afwijzing, alleen "een medewerker kijkt mee"
    gezichtControle(front.bytes, input.files.selfie.bytes, input.files.selfie2 && imageOk(input.files.selfie2) ? input.files.selfie2.bytes : undefined),
    // automatisch goedkeuren op het gezicht staat standaard uit; de eigenaar zet het aan na een meting (Admin → Beheer → Functies).
    // Bij een storing in de vlag: uit. De score wordt altijd bewaard en getoond.
    featureEnabled("id-gezicht-automatisch").catch(() => false),
  ]);
  // de live reeks van de selfies (lib/kyc/gezicht/reeks.ts): zag de server het hoofd met tussenstanden draaien?
  // Voorlopig alleen meten, geen poort; een storing telt als "niet gemeten".
  const reeks = await reeksSamenvatting(user.id).catch(() => null);

  // --- MRZ: wat het document zelf zegt, met controlecijfers (lib/kyc/mrz.ts) ---
  // Geldig = nummer, geboortedatum en vervaldatum hebben elk een kloppend
  // controlecijfer: dat is hard bewijs en gaat vóór wat iemand intypte.
  const mrzGeldig = mrz?.geldig === true;
  const mrzNummerOk = mrzGeldig && zelfdeNummer(mrz.documentnummer, input.documentNumber);
  // (review M3) achternaam exact + eerste voornaam; "Jan Jansen" is niet "Piet Jansen"
  const mrzNaamOk = mrzGeldig && documentNaamPast(user.fullName, mrz);
  if (input.documentType !== "DRIVERS_LICENSE") {
    checks.push({
      label: "Code op het document gelezen (MRZ)",
      ok: mrzGeldig,
      detail: mrzGeldig
        ? `Controlecijfers kloppen${mrz.vervaldatum ? ` · geldig tot ${datumNl(mrz.vervaldatum)}` : ""}`
        : mrz
          ? "De code onderop het document is niet zeker gelezen. Een medewerker kijkt mee."
          : "De code onderop het document is niet gevonden. Maak de foto recht van boven, zonder glans. Een medewerker kijkt mee.",
    });
  }
  if (mrzGeldig) {
    checks.push({
      label: "Documentnummer komt overeen met het document",
      ok: mrzNummerOk,
      detail: mrzNummerOk ? "Het getypte nummer staat ook op het document" : "Het getypte documentnummer wijkt af van het nummer op het document",
    });
    checks.push({
      label: "Naam op het document komt overeen met je account",
      ok: mrzNaamOk,
      detail: mrzNaamOk ? "Gelezen van het document zelf" : "De naam op het document wijkt af van je accountnaam",
    });
    // de vervaldatum van het document zelf gaat vóór de getypte datum
    if (mrz.vervaldatum) {
      expiry = new Date(mrz.vervaldatum);
      expiryOk = !mrz.verlopen;
      expiryCheck.ok = expiryOk;
      expiryCheck.detail = mrz.verlopen
        ? `Volgens de code op het document is het verlopen op ${datumNl(mrz.vervaldatum)}. Gebruik een geldig document.`
        : `Geldig tot ${datumNl(mrz.vervaldatum)} (gelezen van het document)`;
    }
  }

  if (vision.available && vision.document) {
    checks.push({
      label: "Documentfoto-echtheid (beeldcontrole)",
      ok: vision.document.plausible,
      detail: vision.document.plausible
        ? "Ziet eruit als een echte foto van een fysiek document"
        : vision.document.concerns[0] ?? "De documentfoto's zien er niet betrouwbaar uit",
    });
  }
  if (vision.available && vision.face) {
    checks.push({
      label: "Gezicht komt overeen met document (beeldcontrole)",
      ok: vision.face.samePerson,
      detail: vision.face.samePerson
        ? "Selfie en pasfoto lijken dezelfde persoon"
        : vision.face.concerns[0] ?? "Selfie en pasfoto lijken niet dezelfde persoon",
    });
    checks.push({
      label: "Spoof-controle op de selfie (heuristisch, geen echte liveness-check)",
      ok: vision.face.looksLive,
      detail: vision.face.looksLive
        ? "Ziet eruit als een rechtstreekse foto van een persoon"
        : vision.face.concerns[0] ?? "De selfie lijkt mogelijk een foto van een foto of scherm",
    });
  }
  // --- het gezicht: de pasfoto op het document tegen de selfie (eigen model, lib/kyc/gezicht) ---
  checks.push({
    label: "Gezicht komt overeen met de pasfoto op het document (gezichtscontrole)",
    ok: gezicht.oordeel === "zelfde",
    detail: gezicht.reden,
  });
  if (gezicht.score !== null) {
    checks.push({
      label: "Gezichtsgelijkenis (score)",
      intern: true,
      ok: true,
      detail: `${Math.round(gezicht.score * 100)}% (zeker vanaf ${Math.round(GEZICHT_DREMPEL.zeker * 100)}%, aannemelijk vanaf ${Math.round(GEZICHT_DREMPEL.mogelijk * 100)}%). Er wordt geen gezichtsprofiel bewaard, alleen deze score.`,
    });
  }
  // --- de beweging: een tweede selfie met een gedraaid hoofd, tegen een foto of scherm als selfie (lib/kyc/gezicht/beweging.ts) ---
  checks.push({
    label: "Hoofd gedraaid op de tweede selfie (bewegingscontrole)",
    ok: gezicht.beweging.oordeel === "ok",
    detail: gezicht.beweging.reden,
  });

  // --- de chip van het document (NFC via de app, passieve authenticatie) ---
  // "Echt" = de gegevens zijn door een vertrouwde overheid ondertekend. Dat zegt
  // niet dat wie ze instuurt de kaart vasthoudt (review H3): de chip vervangt de
  // MRZ op de foto alleen als die onleesbaar is, en zijn beide gelezen, dan moeten
  // nummer en naam van chip en foto gelijk zijn (review H1).
  const chipNummerOk = Boolean(chip?.nummerKlopt && chip.documentnummer && zelfdeNummer(chip.documentnummer, input.documentNumber));
  const chipNaamOk = Boolean(chip?.naamOpChip && documentNaamPast(user.fullName, chip.naamOpChip));
  const chipOk = Boolean(chip?.echt && chipNummerOk && chipNaamOk);
  // H1: chip en foto-MRZ horen bij een ander document of een andere persoon
  const chipFotoVerschil = Boolean(
    mrzGeldig &&
      chip?.documentnummer &&
      chip.naamOpChip &&
      (!zelfdeNummer(chip.documentnummer, mrz.documentnummer) || !documentNaamPast(`${mrz.voornamen} ${mrz.achternaam}`, chip.naamOpChip)),
  );
  // een nette handtekening van een ondertekenaar die zeker NIET van de overheid komt (M5): vervalst
  const chipVals = Boolean(chip && chip.handtekeningOk && chip.ketenOk === false);
  // H3: hetzelfde zegel al bij een ander account = hergebruikte chipgegevens
  const zegelElders = chip?.sodHash
    ? await prisma.identityVerification
        .findFirst({ where: { userId: { not: user.id }, rawPayload: { path: ["chip", "sodHash"], equals: chip.sodHash } }, select: { id: true } })
        .catch(() => null)
    : null;
  if (chip) {
    checks.push({
      label: "Chip van het document gelezen (NFC)",
      ok: chipOk && !chipFotoVerschil,
      detail: chipFotoVerschil
        ? "De chip hoort bij een ander document of een andere persoon dan de foto's. Een medewerker kijkt mee."
        : chipOk
          ? `Door de overheid ondertekend${chip.land ? ` (${chip.land})` : ""}; nummer en naam kloppen. Dit zegt niet dat jij de kaart vasthoudt: daarvoor zijn de foto's en de selfie.`
          : chipVals
            ? "De chip is niet door de overheid van dit land ondertekend"
            : chip.echt && !chipNummerOk
              ? "De chip is door de overheid ondertekend, maar hoort bij een ander documentnummer dan opgegeven"
              : chip.echt && !chipNaamOk
                ? "De chip is door de overheid ondertekend, maar de naam erop wijkt af van je account"
                : chip.ketenOk === null && chip.handtekeningOk && chip.hashesOk
                  ? "Niet gecontroleerd: het zegel is gelezen, maar of het van de overheid is, controleert een medewerker"
                  : "De chip kon niet worden bevestigd. Een medewerker kijkt mee.",
    });
    checks.push({
      label: "Chipgegevens niet eerder bij een ander account gebruikt",
      intern: true,
      ok: !zegelElders,
      detail: zegelElders ? "Dezelfde chipgegevens zijn al bij een ander account ingestuurd. Een medewerker kijkt mee." : "Niet eerder gezien",
    });
  }

  // --- automatisch: werkrecht, leeftijd, hetzelfde document elders ---------
  // Alleen uit de MRZ op de gefotografeerde kaart, nooit van de chip (review N5, extra slot):
  // zonder foto-MRZ (rijbewijs, onleesbaar) hoort de chip bij een ánder document dan de foto.
  // chipOk alleen is niet genoeg: wie een account op naam van een ander maakt en diens
  // chipnummer bij "rijbewijs" typt, haalt chipOk; dat gaat nu alleen mis op het nummerformaat
  // (een NL-documentnummer heeft letters), maar niet meer zodra er een CSCA bij komt van een land
  // met nummers van alleen cijfers. Een eerlijke werker verliest niets: bij hem is het getypte
  // rijbewijsnummer nooit zijn chipnummer. Onbekend = een mens. Alleen de categorie gaat mee in
  // de uitslag; de nationaliteit en de geboortedatum worden niet bewaard.
  const werkrecht = mrzGeldig ? werkrechtUitMrz(mrz) : null;
  const leeftijd = mrzGeldig ? leeftijdsgroep(mrz.geboortedatum, amsterdamDayKey(new Date())) : null;
  if (werkrecht) checks.push({ label: "Recht om te werken in Nederland", ok: werkrecht === "vrij", detail: WERKRECHT_TEKST[werkrecht] });
  if (leeftijd) checks.push({ label: "Leeftijd", ok: leeftijd === "volwassen", detail: LEEFTIJD_TEKST[leeftijd] });
  if (input.viaTweedeToestel) {
    const eerder = input.tweedeToestel?.zonderVlag === true;
    checks.push({
      label: eerder ? "Eerder via je telefoon ingestuurd" : "Ingestuurd vanaf je telefoon",
      ok: false,
      detail: eerder
        ? "Je stuurde eerder foto's via je telefoon in. Een medewerker kijkt mee voordat je verificatie rond is."
        : "Je foto's kwamen via je telefoon binnen. Een medewerker kijkt mee voordat je verificatie rond is.",
    });
  }
  const tt = input.tweedeToestel;
  if (tt) {
    if (input.viaTweedeToestel && !tt.zonderVlag) {
      checks.push({
        label: "Telefoon en laptop op hetzelfde netwerk",
        intern: true,
        ok: tt.zelfdeNetwerk === true,
        detail:
          tt.zelfdeNetwerk === true
            ? "Ja: de telefoon en de laptop gebruikten hetzelfde netwerk"
            : tt.zelfdeNetwerk === false
              ? "Nee: andere netwerken. Dat kan ook bij mobiel internet; kijk extra goed of de foto's bij deze persoon horen."
              : "Onbekend",
      });
    }
    if (tt.zonderVlag) {
      checks.push({
        label: "Foto's na een overdracht via de telefoon",
        intern: true,
        ok: false,
        detail: "Er kwamen eerder foto's via de telefoon binnen, maar deze zijn los ingestuurd. Kijk extra goed of het document en de selfie bij deze persoon horen.",
      });
    }
    checks.push({
      label: "Geen 'dit is niet mijn account' op een telefoon",
      intern: true,
      ok: tt.geweigerd === 0,
      detail:
        tt.geweigerd === 0
          ? "Niet gekozen"
          : `Een telefoon koos ${tt.geweigerd === 1 ? "één keer" : `${tt.geweigerd} keer`} "Dit is niet mijn account" voor dit account (30 dagen). Mogelijk een doorgestuurde link.`,
    });
  }

  // hetzelfde document (HMAC over het nummer, review N3) bij een ander account: een mens kijkt
  const docHash = documentHash(input.documentNumber);
  const elders = await prisma.identityVerification
    .findFirst({
      where: { documentNumberHash: docHash, userId: { not: user.id }, status: { in: [KycStatus.VERIFIED, KycStatus.PENDING] } },
      select: { id: true },
    })
    .catch(() => null);
  checks.push({
    label: "Document niet al gebruikt door een ander account",
    intern: true,
    ok: !elders,
    detail: elders ? "Dit document is al gebruikt bij een ander account. Een medewerker kijkt mee." : "Dit document hoort bij geen ander account",
  });

  // --- store the three photos (on the box's own disk) -----------------
  const [storedFront, storedBack, storedSelfie] = await Promise.all([
    storeUpload({ filename: front.filename, mimeType: front.mimeType, bytes: front.bytes, uploadedById: user.id }),
    storeUpload({
      filename: input.files.back.filename,
      mimeType: input.files.back.mimeType,
      bytes: input.files.back.bytes,
      uploadedById: user.id,
    }),
    storeUpload({
      filename: input.files.selfie.filename,
      mimeType: input.files.selfie.mimeType,
      bytes: input.files.selfie.bytes,
      uploadedById: user.id,
    }),
  ]);
  // de tweede selfie (gedraaid hoofd) bewaren we ook, zodat een medewerker de beweging zelf kan zien
  const storedSelfie2 = input.files.selfie2 && imageOk(input.files.selfie2)
    ? await storeUpload({ filename: input.files.selfie2.filename, mimeType: input.files.selfie2.mimeType, bytes: input.files.selfie2.bytes, uploadedById: user.id })
    : null;
  // Kept for the doc-number hash below, unaffected by the rename.
  const stored = storedFront;
  // de maat per foto (bij de live camera = de resolutie van de camerastream): alleen breedte en hoogte, om te meten
  const [maatVoor, maatAchter, maatSelfie, maatSelfie2] = await Promise.all([
    fotoMaat(input.files.front.bytes),
    fotoMaat(input.files.back.bytes),
    fotoMaat(input.files.selfie.bytes),
    storedSelfie2 && input.files.selfie2 ? fotoMaat(input.files.selfie2.bytes) : Promise.resolve(null),
  ]);

  // --- combined decision -----------------------------------------
  // A confident vision mismatch is a real fraud signal (someone else's ID) —
  // hard-fail on it. Anything less than confident, or the model simply being
  // unavailable, must never block: it falls through to autoApprove's checks
  // below and lands in "in_review" at worst, same as every other soft signal.
  const visionFaceMismatch =
    vision.available && vision.face !== null && !vision.face.samePerson && vision.face.faceMatchConfidence >= 0.7;
  // De tekst-AI wijst nooit meer zelf af (12 nov 2026): hij ziet alleen wat iemand typte. Zegt hij "afgekeurd", dan
  // kijkt een mens (zie redenenNietAutomatisch).
  const hardFail =
    !expiryOk ||
    chipVals ||
    companyStatus === "DISSOLVED" ||
    visionFaceMismatch;
  // Automatisch goedkeuren alleen als iets echt naar de foto's heeft gekeken: het eigen gezichtsmodel (pasfoto tegen
  // selfie, met een echte hoofddraai, alleen bij een paspoort of ID-kaart met een kloppende MRZ) of het oude beeldmodel.
  // Eén bron voor de beslissing en de uitleg (lib/onboarding/auto-redenen.ts): de redenen staan bij de controle in het
  // beheer en in de melding aan de eigenaar. Leeg = zelf goedkeuren.
  const beeldmodelOk = Boolean(
    vision.available && vision.document !== null && vision.face !== null && vision.document.plausible && vision.face.samePerson && vision.face.looksLive,
  );
  const autoFeiten: AutoFeiten = {
    kvkOk: skipKvk || kvkValid,
    naamOk: nameOk,
    nummerFormaatOk: numOk,
    geldigOk: expiryOk,
    rijbewijs: input.documentType === "DRIVERS_LICENSE",
    mrzGeldig,
    mrzNummerOk,
    mrzNaamOk,
    chipFotoVerschil,
    werkrecht,
    leeftijd,
    viaTweedeToestel: Boolean(input.viaTweedeToestel),
    telefoonGeweigerd: (input.tweedeToestel?.geweigerd ?? 0) > 0,
    dubbelDocument: Boolean(elders),
    zegelElders: Boolean(zegelElders),
    gezichtAutomatischAan: gezichtAuto,
    gezichtOordeel: gezicht.oordeel,
    gezichtScore: gezicht.score,
    bewegingOordeel: gezicht.beweging.oordeel,
    beeldmodelOk,
    aiVerdict: ai.verdict,
    aiZeker: ai.verdict === "approved" && ai.confidence >= 0.65,
    // live bewijs van de server: zonder live camerabeelden (zelf gekozen foto's) kijkt een mens (review 73)
    liveBeelden: reeks?.beelden ?? 0,
  };
  const gezichtOk = gezichtBeslist(autoFeiten);
  const nietAutomatisch = redenenNietAutomatisch(autoFeiten);
  const autoApprove = !hardFail && nietAutomatisch.length === 0;

  const outcome: OnboardingResult["outcome"] = hardFail
    ? "rejected"
    : autoApprove
      ? "verified"
      : "in_review";
  const kycStatus: KycStatus =
    outcome === "verified"
      ? KycStatus.VERIFIED
      : outcome === "rejected"
        ? KycStatus.REJECTED
        : KycStatus.PENDING;

  await prisma.$transaction(async (tx) => {
    await tx.identityVerification.create({
      data: {
        userId: user.id,
        provider: "AI_LOCAL",
        vendorData: user.id,
        decisionStatus: outcome,
        documentType: input.documentType,
        documentNumberHash: docHash,
        status: kycStatus,
        verifiedAt: outcome === "verified" ? new Date() : null,
        expiresAt: Number.isNaN(expiry.getTime()) ? null : expiry,
        // Populated only when a vision model is configured (LLM_VISION_MODEL);
        // a passive spoof heuristic, not a certified biometric liveness score —
        // see lib/kyc/vision.ts.
        livenessScore: vision.face?.livenessConfidence ?? null,
        // de score van het eigen gezichtsmodel (cosinus 0–1) gaat vóór die van het beeldmodel; een score, geen gezichtsgegevens
        faceMatchScore: gezicht.score ?? vision.face?.faceMatchConfidence ?? null,
        rawPayload: JSON.parse(
          JSON.stringify({
            outcome,
            ai,
            // alleen de uitslag: oordeel, score en of de controle kon draaien (geen kenmerken, geen foto)
            gezicht: {
              oordeel: gezicht.oordeel,
              score: gezicht.score,
              technisch: gezicht.technisch,
              automatisch: gezichtOk,
              ms: gezicht.ms,
              // sinds 11 nov 2026 grijs vergeleken, drempel 0,42 (lib/kyc/gezicht/vergelijk.ts): zo blijven oude en nieuwe scores uit elkaar te houden
              grijs: true,
              beweging: { oordeel: gezicht.beweging.oordeel, verschil: gezicht.beweging.verschil },
              // alleen de samenvatting (beelden, tussenstanden, ms, draai); de metingen zelf worden hieronder gewist
              ...(reeks ? { reeks } : {}),
            },
            // zonder het documentnummer en de vervaldatum die het beeldmodel las
            vision: vision.document ? { ...vision, document: { ...vision.document, documentNumber: null, expiryDate: null } } : vision,
            checks,
            // alleen de uitslag van de MRZ: geen nummer, naam, geboortedatum of BSN
            mrz: mrz
              ? { geldig: mrz.geldig, volledig: mrz.volledig, soort: mrz.soort, verlopen: mrz.verlopen, vervaldatum: mrz.vervaldatum, nummerKlopt: mrzNummerOk, naamKlopt: mrzNaamOk }
              : null,
            // de automatische controles: alleen de categorie
            werkrecht,
            leeftijd,
            dubbelDocument: Boolean(elders),
            // waarom deze controle niet zelf goedkeurde (leeg = zelf goedgekeurd); voor het beheer
            ...(hardFail ? {} : { nietAutomatisch }),
            // de gegevens van het document voor het beheer (12 nov 2026, eigenaar: "de gegevens bij de gebruiker zien"):
            // de naam zoals op het document en de laatste drie tekens van het nummer. Nooit het BSN of het vrije veld van
            // de MRZ, en (zoals werkrecht/leeftijd) geen nationaliteit of geboortedatum: die staan op de foto zelf.
            document: {
              naam: mrzGeldig ? `${mrz.voornamen} ${mrz.achternaam}`.trim() : input.nameOnDocument.trim().slice(0, 120),
              uitDeCode: mrzGeldig,
              nummerEind: (mrzGeldig ? mrz.documentnummer : input.documentNumber).trim().slice(-3),
            },
            // alleen de uitslag van de chip: geen nummer, naam, pasfoto of BSN
            chip: chip
              ? {
                  echt: chip.echt,
                  hashesOk: chip.hashesOk,
                  handtekeningOk: chip.handtekeningOk,
                  ketenOk: chip.ketenOk,
                  geldigOk: chip.geldigOk,
                  land: chip.land,
                  nummerKlopt: chipNummerOk,
                  naamKlopt: chipNaamOk,
                  andersDanFoto: chipFotoVerschil,
                  elders: Boolean(zegelElders),
                  // om hergebruik bij een ander account te zien, en voor de beoordelaar (review H3/M4)
                  sodHash: chip.sodHash,
                  ds: chip.ds,
                }
              : null,
            uploadIds: { front: storedFront.id, back: storedBack.id, selfie: storedSelfie.id, ...(storedSelfie2 ? { selfie2: storedSelfie2.id } : {}) },
            // live camera of bestandskeuze, per vak (lib/kyc/foto-bron.ts): alleen om te meten en te tonen
            bron: {
              front: fotoBron(input.files.front.filename),
              back: fotoBron(input.files.back.filename),
              selfie: fotoBron(input.files.selfie.filename),
              ...(storedSelfie2 && input.files.selfie2 ? { selfie2: fotoBron(input.files.selfie2.filename) } : {}),
            },
            // de maat per vak (lib/kyc/foto-maat.ts): alleen { breed, hoog }
            maat: {
              ...(maatVoor ? { front: maatVoor } : {}),
              ...(maatAchter ? { back: maatAchter } : {}),
              ...(maatSelfie ? { selfie: maatSelfie } : {}),
              ...(maatSelfie2 ? { selfie2: maatSelfie2 } : {}),
            },
            // de beoordelingsroute zet de voorkant pas bij goedkeuring bij de documenten (review 2, H1-bis)
            viaTweedeToestel: Boolean(input.viaTweedeToestel),
            fileSha256: stored.sha256,
          }),
        ) as Prisma.InputJsonValue,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { kycStatus },
    });

    // The front-of-document photo we just captured *is* the "Identiteitsbewijs"
    // compliance document (lib/compliance/documents.ts) — supersede any
    // earlier one so the freelancer is never asked to upload their ID again
    // on the same page. Mirrors storeDoc()'s "one active doc per kind" rule.
    // Except: a driver's license (ComplianceDocsPanel deliberately only
    // accepts a passport or ID card there — a real, separate requirement, not
    // the duplicate we're fixing) or a rejected outcome (e.g. a confident
    // vision face-mismatch) — don't wave through a document we just decided
    // not to trust.
    // Ook niet bij foto's van een tweede toestel (review 2, H1-bis): de werker kan zijn eigen
    // documenten op volle grootte downloaden (/api/me/documents), en bij een doorgestuurde link
    // is dat het ID van een ander. Die voorkant komt er pas bij als een medewerker goedkeurt
    // (app/api/admin/gebruikers/[id]/identiteit/[checkId]).
    if (input.documentType !== "DRIVERS_LICENSE" && outcome !== "rejected" && !input.viaTweedeToestel) {
      await tx.complianceDocument.deleteMany({
        where: { userId: user.id, kind: ComplianceDocKind.ID },
      });
      await tx.complianceDocument.create({
        data: { userId: user.id, kind: ComplianceDocKind.ID, uploadId: storedFront.id },
      });
    }
  });

  await recordAudit({
    category: "KYC",
    action: "kyc.self_serve",
    actorUserId: user.id,
    actorLabel: "user",
    severity: outcome === "rejected" ? "warning" : "info",
    // de echte redenen, niet alleen het KVK: een uitzendkracht heeft er geen en kreeg toch "KVK niet geldig" te lezen
    summary: `Zelf-verificatie ${user.fullName}: ${outcome}${redenTekst(checks)}`,
    targetType: "user",
    targetId: user.id,
    metadata: { outcome, kvkValid, aiVerdict: ai.verdict, aiConfidence: ai.confidence, beeldcontrole: vision.available, mrzGeldig, chipEcht: chip?.echt ?? null },
  });

  // na elke verificatie: de chipuitslag, de MRZ-sleutel en alle chipsessies weg (ook zonder chip)
  await wisChipGegevens(user.id).catch(() => undefined);
  // en de live reeks: samengevat in de controle, de metingen zelf hoeven niet te blijven
  await wisReeks(user.id).catch(() => undefined);

  // ID geverifieerd: de werker hoort het meteen (eenmalig, lib/onboarding/id-geverifieerd.ts)
  if (outcome === "verified") runAfter(() => meldIdGeverifieerd(user.id));

  // Een mens moet kijken: zonder melding blijft iemand onzichtbaar hangen (4 nov 2026).
  // Niet voor een testaccount (.test, .example, ...): die melding gaat anders echt naar de eigenaar (AGENTS.md).
  const testAccount = typeof user.email === "string" && isReservedTestAddress(user.email);
  if (outcome === "in_review" && !testAccount) {
    alertOwnerLater({
      key: `kyc-beoordeling:${user.id}`,
      title: `ID-controle wacht op je: ${user.fullName}`,
      // eerst waarom het niet vanzelf ging (dezelfde lijst als in het beheer), dan de details
      detail: `${user.fullName} heeft zelf foto's van een identiteitsbewijs geüpload. Niet vanzelf goedgekeurd omdat: ${nietAutomatisch.join("; ") || "een controle faalde"}. ${gezicht.beschikbaar ? `De gezichtscontrole gaf ${gezicht.score !== null ? `${Math.round(gezicht.score * 100)}%` : "geen score"}: ${gezicht.reden}` : vision.available ? "De beeldcontrole was niet overtuigend." : `De gezichtscontrole kon niet beslissen (${gezicht.reden}); bekijk de foto's zelf.`}${redenTekst(checks)} Keur goed of af bij de gebruiker.`,
      severity: "warning",
      url: `/admin/gebruikers/${user.id}`,
    });
  }

  // naar de werker alleen de openbare controles (review N4); intern blijft in rawPayload en de audit
  const openbaar = checks.filter((c) => !c.intern);
  const reasons = [
    ...openbaar.filter((c) => !c.ok).map((c) => c.detail),
    ...ai.reasons,
  ];

  return {
    kycStatus,
    kvkValid,
    outcome,
    companyName,
    checks: openbaar,
    reasons: [...new Set(reasons)],
    // bij "in behandeling" een vaste, eerlijke tekst: de AI-samenvatting kan "alles klopt" zeggen terwijl een mens nog kijkt
    summary:
      outcome === "in_review"
        ? "Je aanvraag staat in behandeling. Een medewerker van ZekerFlex bekijkt je foto's, meestal binnen een werkdag. Je krijgt bericht zodra je diensten kunt aannemen."
        : ai.summary ||
          (outcome === "verified" ? "Je bent geverifieerd en kunt diensten aannemen." : "De verificatie is afgewezen. Controleer je gegevens en probeer opnieuw."),
  };
}

export interface WalletOnboardingInput {
  userId: string;
  attemptId: string;
  kvkNumber: string;
  vatNumber?: string | undefined;
  postalCode: string;
  /** land van de thuisbasis (ISO, standaard NL); niet het fiscale land, zie lib/geo/thuisland.ts */
  country?: string | undefined;
  /** woonplaats, alleen nodig voor een thuisbasis in het buitenland */
  city?: string | undefined;
  houseNumber?: string | undefined;
  payoutIban?: string | undefined;
  ibanCode?: string | undefined;
}

/**
 * Onboarding via an already-verified digital wallet credential (see
 * lib/kyc/wallet.ts) instead of the 3-photo capture. The identity proof
 * itself — cryptographic signature + trusted issuer + name/expiry checks —
 * already happened in completeWalletVerification(); this consumes that
 * one-shot result and runs the same downstream steps (home base, KVK,
 * persistence, audit) as the photo path.
 */
export async function submitFreelancerOnboardingViaWallet(
  input: WalletOnboardingInput,
): Promise<OnboardingResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, fullName: true, freelancerProfile: { select: { id: true } } },
  });
  if (!user) throw AppError.notFound("Account niet gevonden");

  // De IBAN-bevestiging eerst, vóór het eenmalige wallet-resultaat verbruikt wordt: een
  // 423 mag de verificatie niet laten vervallen. De code is eenmalig, dus alleen hier.
  const nieuwIban = schoonIban(input.payoutIban);
  if (user.freelancerProfile && nieuwIban) {
    const huidig = await prisma.freelancerProfile.findUnique({ where: { id: user.freelancerProfile.id }, select: { payoutIban: true } });
    await eisIbanBevestiging(user.id, huidig?.payoutIban, nieuwIban, input.ibanCode);
  }

  const claims = await consumeVerifiedWalletAttempt(input.userId, input.attemptId);
  if (!claims) {
    throw AppError.validation(
      "De wallet-verificatie is verlopen of al gebruikt. Rond de verificatie opnieuw af.",
    );
  }

  const checks: OnboardingResult["checks"] = [
    {
      label: "Digitale ID-wallet",
      ok: true,
      detail: "Cryptografisch geverifieerd bij een vertrouwde uitgever",
    },
  ];

  const base = await ensureFreelancerBase({
    userId: user.id,
    existingProfileId: user.freelancerProfile?.id,
    kvkNumber: input.kvkNumber,
    vatNumber: input.vatNumber,
    postalCode: input.postalCode,
    country: input.country,
    city: input.city,
    houseNumber: input.houseNumber,
    payoutIban: input.payoutIban,
    ibanAlBevestigd: true,
  });
  checks.push(...base.checks);
  const { skipKvk, kvkValid, companyName } = base;

  const fullName = [claims.givenName, claims.familyName].filter(Boolean).join(" ").trim();
  const simAccount = fullName ? nameSimilarity(user.fullName, fullName) : 0;
  const simKvk = companyName && fullName ? nameSimilarity(companyName, fullName) : 0;
  const nameOk = simAccount >= 0.5 || simKvk >= 0.5;
  checks.push({
    label: "Naam komt overeen",
    ok: nameOk,
    detail: nameOk
      ? "Naam in de wallet komt overeen met je account"
      : "De naam in de wallet wijkt af van je accountnaam",
  });

  const expiry = claims.expiryDate ? new Date(claims.expiryDate) : null;
  const expiryOk = expiry !== null && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
  checks.push({
    label: "Geldigheid document",
    ok: expiryOk,
    detail: expiryOk
      ? `Geldig tot ${expiry!.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}`
      : "Het document in de wallet lijkt verlopen",
  });

  // The wallet's own DocumentType doesn't map 1:1 onto our three-way enum;
  // only the mobile driver's license case matters here, since
  // ComplianceDocsPanel's own upload policy special-cases exactly that kind.
  const documentType: DocKind = claims.rawDocumentType.toLowerCase().includes("mdl")
    ? "DRIVERS_LICENSE"
    : "ID_CARD";

  const hardFail = !nameOk || !expiryOk;
  const autoApprove = !hardFail && (skipKvk || kvkValid);
  const outcome: OnboardingResult["outcome"] = hardFail ? "rejected" : autoApprove ? "verified" : "in_review";
  const kycStatus: KycStatus =
    outcome === "verified" ? KycStatus.VERIFIED : outcome === "rejected" ? KycStatus.REJECTED : KycStatus.PENDING;

  const docHash = documentHash(claims.documentNumber ?? "");

  await prisma.$transaction(async (tx) => {
    await tx.identityVerification.create({
      data: {
        userId: user.id,
        provider: "DIGITAL_WALLET",
        vendorData: user.id,
        decisionStatus: outcome,
        documentType,
        documentNumberHash: docHash,
        status: kycStatus,
        verifiedAt: outcome === "verified" ? new Date() : null,
        expiresAt: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
        rawPayload: JSON.parse(JSON.stringify({ outcome, claims, checks })) as Prisma.InputJsonValue,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { kycStatus } });
    // No file to store — docStatus() in lib/compliance/documents.ts also
    // accepts a verified DIGITAL_WALLET IdentityVerification directly, so
    // the separate "Identiteitsbewijs" upload slot is satisfied without one.
  });

  await recordAudit({
    category: "KYC",
    action: "kyc.wallet_verify",
    actorUserId: user.id,
    actorLabel: "user",
    severity: outcome === "rejected" ? "warning" : "info",
    summary: `Wallet-verificatie ${user.fullName}: ${outcome} (KVK ${kvkValid ? "geldig" : "niet geldig"})`,
    targetType: "user",
    targetId: user.id,
    metadata: { outcome, kvkValid },
  });

  if (outcome === "verified") runAfter(() => meldIdGeverifieerd(user.id));

  const reasons = checks.filter((c) => !c.ok).map((c) => c.detail);

  return {
    kycStatus,
    kvkValid,
    outcome,
    companyName,
    checks,
    reasons: [...new Set(reasons)],
    summary:
      outcome === "verified"
        ? "Je bent geverifieerd via je digitale ID-wallet en kunt diensten aannemen."
        : outcome === "rejected"
          ? "De walletverificatie kon niet worden bevestigd. Gebruik de foto-verificatie hieronder."
          : "Je aanvraag staat in behandeling.",
  };
}
