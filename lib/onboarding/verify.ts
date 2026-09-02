import { createHash } from "node:crypto";
import { KycStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { geocodePostcode } from "@/lib/integrations/pdok";
import { registerFreelancerCompany } from "@/lib/company/registration";
import { storeUpload } from "@/lib/storage/local";

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
// ---------------------------------------------------------------------------

export type DocKind = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";

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
  file: { filename: string; mimeType: string; bytes: Buffer };
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

function nameSimilarity(a: string, b: string): number {
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

export async function submitFreelancerOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, fullName: true, kycStatus: true, freelancerProfile: { select: { id: true } } },
  });
  if (!user) throw AppError.notFound("Account niet gevonden");

  const checks: OnboardingResult["checks"] = [];

  // --- file sanity ---------------------------------------------------------
  const mime = input.file.mimeType.toLowerCase();
  const fileOk = ALLOWED_MIME.has(mime) && input.file.bytes.length > 8_000;
  checks.push({
    label: "Documentbestand",
    ok: fileOk,
    detail: fileOk
      ? `${mime}, ${(input.file.bytes.length / 1024).toFixed(0)} kB`
      : "Gebruik een duidelijke foto of scan (JPG, PNG of PDF, min. 8 kB).",
  });
  if (!fileOk) throw AppError.validation("Het geüploade document is niet leesbaar. Probeer een duidelijkere foto of scan.");

  // --- geocode home base -------------------------------------------------
  const geo = await geocodePostcode(input.postalCode, input.houseNumber);
  checks.push({
    label: "Thuisbasis",
    ok: !geo.approximate,
    detail: geo.approximate
      ? "Postcode kon niet exact worden gelokaliseerd; je kunt dit later bijwerken."
      : `${geo.street ?? ""} ${input.houseNumber}, ${geo.city ?? ""}`.trim(),
  });

  // --- ensure a freelancer profile exists -------------------------------
  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  let freelancerProfileId = user.freelancerProfile?.id;
  if (!freelancerProfileId) {
    const created = await prisma.freelancerProfile.create({
      data: {
        userId: user.id,
        kvkNumber: cleanKvk || `pending-${user.id.slice(0, 8)}`,
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

  // --- KVK / Handelsregister -------------------------------------------
  let kvkValid = false;
  let companyName: string | null = null;
  let companyTradeName: string | null = null;
  let companyStatus = "ONBEKEND";
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

  // --- AI authenticity review --------------------------------------
  const ai = await aiAuthenticityReview({
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
      sizeBytes: input.file.bytes.length,
      filename: input.file.filename,
    },
    deterministic: checks,
  });

  // --- store the document (on the box's own disk) ------------------
  const stored = await storeUpload({
    filename: input.file.filename,
    mimeType: input.file.mimeType,
    bytes: input.file.bytes,
    uploadedById: user.id,
  });

  // --- combined decision -----------------------------------------
  const hardFail =
    !expiryOk ||
    ai.verdict === "rejected" ||
    companyStatus === "DISSOLVED";
  const autoApprove =
    !hardFail &&
    kvkValid &&
    nameOk &&
    numOk &&
    expiryOk &&
    ai.verdict === "approved" &&
    ai.confidence >= 0.65;

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
        rawPayload: JSON.parse(
          JSON.stringify({ outcome, ai, checks, uploadId: stored.id, fileSha256: stored.sha256 }),
        ) as Prisma.InputJsonValue,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { kycStatus },
    });
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
