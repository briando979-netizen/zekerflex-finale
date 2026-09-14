import { createHash } from "node:crypto";
import { ComplianceDocKind, KycStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { geocodePostcode } from "@/lib/integrations/pdok";
import { registerFreelancerCompany } from "@/lib/company/registration";
import { storeUpload } from "@/lib/storage/local";
import { runVisionReview } from "@/lib/kyc/vision";
import { consumeVerifiedWalletAttempt } from "@/lib/kyc/wallet";

// ---------------------------------------------------------------------------
// Self-serve freelancer onboarding verification.
//
//  1. Geocode the home base (PDOK — Dutch government geocoder).
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
  postalCode: string;
  houseNumber: string;
  payoutIban: string;
  documentType: DocKind;
  documentNumber: string;
  documentExpiry: string; // yyyy-mm-dd
  nameOnDocument: string;
  files: { front: CapturedImage; back: CapturedImage; selfie: CapturedImage };
}

export interface OnboardingResult {
  kycStatus: KycStatus;
  kvkValid: boolean;
  outcome: "verified" | "in_review" | "rejected";
  companyName: string | null;
  checks: { label: string; ok: boolean; detail: string }[];
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
    return {
      verdict: ["approved", "needs_review", "rejected"].includes(verdict.verdict)
        ? verdict.verdict
        : "needs_review",
      confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
      reasons: Array.isArray(verdict.reasons) ? verdict.reasons.slice(0, 6).map(String) : [],
      summary: typeof verdict.summary === "string" ? verdict.summary : "",
    };
  } catch (err) {
    logger.warn("kyc ai review unavailable, deferring to human", {
      error: (err as Error).message,
    });
    return {
      verdict: "needs_review",
      confidence: 0,
      reasons: ["De automatische beoordeling was tijdelijk niet beschikbaar; een controleur kijkt ernaar."],
      summary: "In behandeling — automatische beoordeling niet beschikbaar.",
    };
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

/**
 * Geocode + create/update the FreelancerProfile + (optional) KVK check —
 * shared by both the photo-capture and digital-wallet onboarding paths,
 * which differ only in how the identity itself gets proven.
 */
async function ensureFreelancerBase(input: {
  userId: string;
  existingProfileId?: string | undefined;
  kvkNumber: string;
  postalCode: string;
  houseNumber: string;
  payoutIban: string;
}): Promise<FreelancerBaseResult> {
  const checks: OnboardingResult["checks"] = [];

  const geo = await geocodePostcode(input.postalCode, input.houseNumber);
  checks.push({
    label: "Thuisbasis",
    ok: !geo.approximate,
    detail: geo.approximate
      ? "Postcode kon niet exact worden gelokaliseerd; je kunt dit later bijwerken."
      : `${geo.street ?? ""} ${input.houseNumber}, ${geo.city ?? ""}`.trim(),
  });

  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  let freelancerProfileId = input.existingProfileId;
  if (!freelancerProfileId) {
    const created = await prisma.freelancerProfile.create({
      data: {
        userId: input.userId,
        kvkNumber: cleanKvk || `pending-${input.userId.slice(0, 8)}`,
        payoutIban: input.payoutIban.replace(/\s+/g, "").toUpperCase(),
        homeLatitude: geo.latitude,
        homeLongitude: geo.longitude,
        homePostalCode: geo.postalCode,
      },
      select: { id: true },
    });
    freelancerProfileId = created.id;
  } else {
    await prisma.freelancerProfile.update({
      where: { id: freelancerProfileId },
      data: {
        payoutIban: input.payoutIban.replace(/\s+/g, "").toUpperCase(),
        homeLatitude: geo.latitude,
        homeLongitude: geo.longitude,
        homePostalCode: geo.postalCode,
      },
    });
  }

  const skipKvk = cleanKvk.length === 0;
  let kvkValid = false;
  let companyName: string | null = null;
  let companyTradeName: string | null = null;
  let companyStatus = "ONBEKEND";
  if (skipKvk) {
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

export async function submitFreelancerOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, fullName: true, kycStatus: true, freelancerProfile: { select: { id: true } } },
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
    postalCode: input.postalCode,
    houseNumber: input.houseNumber,
    payoutIban: input.payoutIban,
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

  const expiry = new Date(input.documentExpiry);
  const expiryOk =
    !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() > Date.now() &&
    expiry.getTime() < Date.now() + 16 * 365 * 24 * 3600 * 1000;
  checks.push({
    label: "Geldigheid document",
    ok: expiryOk,
    detail: expiryOk
      ? `Geldig tot ${expiry.toLocaleDateString("nl-NL")}`
      : "Het document lijkt verlopen of de datum is ongeldig",
  });

  // --- AI authenticity review (text-only) + vision review (photo content),
  // run together since both are independent local-LLM calls ----------------
  const [ai, vision] = await Promise.all([
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
  ]);

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
  // Kept for the doc-number hash below, unaffected by the rename.
  const stored = storedFront;

  // --- combined decision -----------------------------------------
  // A confident vision mismatch is a real fraud signal (someone else's ID) —
  // hard-fail on it. Anything less than confident, or the model simply being
  // unavailable, must never block: it falls through to autoApprove's checks
  // below and lands in "in_review" at worst, same as every other soft signal.
  const visionFaceMismatch =
    vision.available && vision.face !== null && !vision.face.samePerson && vision.face.faceMatchConfidence >= 0.7;
  const hardFail =
    !expiryOk ||
    ai.verdict === "rejected" ||
    companyStatus === "DISSOLVED" ||
    visionFaceMismatch;
  const visionOk =
    !vision.available ||
    ((vision.document?.plausible ?? true) && (vision.face?.samePerson ?? true) && (vision.face?.looksLive ?? true));
  const autoApprove =
    !hardFail &&
    (skipKvk || kvkValid) &&
    nameOk &&
    numOk &&
    expiryOk &&
    ai.verdict === "approved" &&
    ai.confidence >= 0.65 &&
    visionOk;

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

  const docHash = createHash("sha256")
    .update(`${input.documentType}:${input.documentNumber.trim().toUpperCase()}`)
    .digest("hex")
    .slice(0, 48);

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
        faceMatchScore: vision.face?.faceMatchConfidence ?? null,
        rawPayload: JSON.parse(
          JSON.stringify({
            outcome,
            ai,
            vision,
            checks,
            uploadIds: { front: storedFront.id, back: storedBack.id, selfie: storedSelfie.id },
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
    if (input.documentType !== "DRIVERS_LICENSE" && outcome !== "rejected") {
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
    summary: `Zelf-verificatie ${user.fullName}: ${outcome} (KVK ${kvkValid ? "geldig" : "niet geldig"})`,
    targetType: "user",
    targetId: user.id,
    metadata: { outcome, kvkValid, aiVerdict: ai.verdict, aiConfidence: ai.confidence },
  });

  const reasons = [
    ...checks.filter((c) => !c.ok).map((c) => c.detail),
    ...ai.reasons,
  ];

  return {
    kycStatus,
    kvkValid,
    outcome,
    companyName,
    checks,
    reasons: [...new Set(reasons)],
    summary:
      ai.summary ||
      (outcome === "verified"
        ? "Je bent geverifieerd en kunt diensten aannemen."
        : outcome === "rejected"
          ? "De verificatie is afgewezen. Controleer je gegevens en probeer opnieuw."
          : "Je aanvraag staat in behandeling."),
  };
}

export interface WalletOnboardingInput {
  userId: string;
  attemptId: string;
  kvkNumber: string;
  postalCode: string;
  houseNumber: string;
  payoutIban: string;
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
    postalCode: input.postalCode,
    houseNumber: input.houseNumber,
    payoutIban: input.payoutIban,
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
      ? `Geldig tot ${expiry!.toLocaleDateString("nl-NL")}`
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

  const docHash = createHash("sha256")
    .update(`${documentType}:${(claims.documentNumber ?? "").trim().toUpperCase()}`)
    .digest("hex")
    .slice(0, 48);

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
