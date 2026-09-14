import { randomUUID } from "node:crypto";
import {
  Claim,
  DocumentType,
  createCredentialsRequest,
  generateJWK,
  generateNonce,
  processCredentials,
  type CredentialsRequest,
  type RawCredentialResponse,
} from "id-verifier";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Digital-wallet identity verification (W3C Digital Credentials API) — an
// additional, fully optional path alongside the photo-capture flow in
// lib/onboarding/verify.ts. Instead of scanning a document, the freelancer
// shares an already-issued digital ID (e.g. a mobile driver's license) from
// their OS/browser wallet, cryptographically verified against the issuer's
// signature — no photo, no AI heuristic, no upload.
//
// Honesty about reach: this API is brand new and, as of writing, requires
// the latest Chrome/Android or Safari 26+ with feature flags, AND a
// government-issued digital ID already provisioned in a compatible wallet —
// something almost no Dutch user has today. This must never be the only
// path; it's additive, and the existing photo flow is unaffected by it.
//
// Flow: startWalletVerification() (server) generates a nonce+JWK, returns
// browser-facing request params. The client calls id-verifier's
// requestCredentials() (browser-only). The raw response comes back here to
// completeWalletVerification() for cryptographic verification + deterministic
// checks against the account. Only once that's accepted does
// consumeVerifiedWalletAttempt() (called from
// lib/onboarding/verify.ts) hand the extracted claims to the rest of
// onboarding — one-shot, tied to the same userId throughout.
// ---------------------------------------------------------------------------

const KV_PREFIX = "kyc-wallet:";
const ATTEMPT_TTL_MS = 10 * 60 * 1000; // comfortably longer than requestCredentials' own 5-minute default

interface PendingAttempt {
  stage: "pending";
  userId: string;
  nonce: string;
  jwk: JsonWebKey;
  createdAt: number;
}
interface VerifiedAttempt {
  stage: "verified";
  userId: string;
  claims: WalletIdentityClaims;
  createdAt: number;
}
type WalletAttempt = PendingAttempt | VerifiedAttempt;

export interface WalletIdentityClaims {
  givenName: string | null;
  familyName: string | null;
  birthDate: string | null;
  documentNumber: string | null;
  expiryDate: string | null;
  issuingCountry: string | null;
  /** The raw DocumentType id from the credential (e.g. "org.iso.18013.5.1.mDL") — informational only. */
  rawDocumentType: string;
}

export interface WalletCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface WalletVerifyOutcome {
  ok: boolean;
  claims: WalletIdentityClaims | null;
  checks: WalletCheck[];
  /** Set when `ok` is false and there's no meaningful per-check breakdown yet (e.g. the attempt expired). */
  reason?: string;
}

function nameSimilarity(a: string, b: string): number {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 2);
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

export async function startWalletVerification(
  userId: string,
): Promise<{ attemptId: string; requestParams: CredentialsRequest }> {
  const nonce = generateNonce();
  const jwk = await generateJWK();
  const requestParams = createCredentialsRequest({
    documentTypes: [DocumentType.EU_PERSONAL_ID, DocumentType.MOBILE_DRIVERS_LICENSE, DocumentType.PHOTO_ID],
    claims: [
      Claim.GIVEN_NAME,
      Claim.FAMILY_NAME,
      Claim.BIRTH_DATE,
      Claim.DOCUMENT_NUMBER,
      Claim.EXPIRY_DATE,
      Claim.ISSUING_COUNTRY,
    ],
    nonce,
    jwk,
  });

  const attemptId = randomUUID();
  await kvSet(`${KV_PREFIX}${attemptId}`, {
    stage: "pending",
    userId,
    nonce,
    jwk,
    createdAt: Date.now(),
  } satisfies PendingAttempt);

  return { attemptId, requestParams };
}

function expired(createdAt: number): boolean {
  return Date.now() - createdAt > ATTEMPT_TTL_MS;
}

export async function completeWalletVerification(input: {
  userId: string;
  attemptId: string;
  credentials: RawCredentialResponse;
  origin: string;
  accountFullName: string;
}): Promise<WalletVerifyOutcome> {
  const key = `${KV_PREFIX}${input.attemptId}`;
  const attempt = await kvGet<WalletAttempt>(key);
  if (!attempt || attempt.stage !== "pending" || attempt.userId !== input.userId || expired(attempt.createdAt)) {
    await kvDelete(key);
    return {
      ok: false,
      claims: null,
      checks: [],
      reason: "Deze verificatiepoging is verlopen of ongeldig. Start opnieuw.",
    };
  }

  let result;
  try {
    result = await processCredentials(input.credentials, {
      nonce: attempt.nonce,
      jwk: attempt.jwk,
      origin: input.origin,
    });
  } catch (err) {
    logger.warn("wallet credential verification failed", { error: (err as Error).message });
    await kvDelete(key);
    return {
      ok: false,
      claims: null,
      checks: [],
      reason: "De digitale ID kon niet worden geverifieerd. Gebruik de foto-verificatie hieronder.",
    };
  }

  const raw = result.claims;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const claims: WalletIdentityClaims = {
    givenName: str(raw.given_name),
    familyName: str(raw.family_name),
    birthDate: str(raw.birth_date),
    documentNumber: str(raw.document_number),
    expiryDate: str(raw.expiry_date),
    issuingCountry: str(raw.issuing_country),
    rawDocumentType: String(
      (result.processedDocuments[0]?.document as { docType?: string } | undefined)?.docType ?? "",
    ),
  };

  const fullName = [claims.givenName, claims.familyName].filter(Boolean).join(" ").trim();
  const nameOk = fullName.length > 0 && nameSimilarity(input.accountFullName, fullName) >= 0.5;
  const expiry = claims.expiryDate ? new Date(claims.expiryDate) : null;
  const expiryOk = expiry !== null && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();

  const checks: WalletCheck[] = [
    {
      label: "Cryptografische controle",
      ok: result.valid,
      detail: result.valid
        ? "Handtekening en integriteit van het document zijn geldig"
        : "De handtekening of integriteit kon niet worden bevestigd",
    },
    {
      label: "Vertrouwde uitgever",
      ok: result.trusted,
      detail: result.trusted
        ? "Uitgegeven door een vertrouwde instantie"
        : "De uitgever van dit document staat niet op een vertrouwde lijst",
    },
    {
      label: "Naam komt overeen",
      ok: nameOk,
      detail: nameOk
        ? `Naam in de wallet (${fullName}) komt overeen met je account`
        : "De naam in de wallet wijkt af van je accountnaam",
    },
    {
      label: "Geldigheid document",
      ok: expiryOk,
      detail: expiryOk
        ? `Geldig tot ${expiry!.toLocaleDateString("nl-NL")}`
        : "Het document lijkt verlopen of de geldigheidsdatum ontbreekt",
    },
  ];

  const ok = result.valid && result.trusted && nameOk && expiryOk;
  if (ok) {
    await kvSet(key, {
      stage: "verified",
      userId: input.userId,
      claims,
      createdAt: Date.now(),
    } satisfies VerifiedAttempt);
  } else {
    await kvDelete(key);
  }

  return { ok, claims, checks };
}

/** One-shot: returns the verified claims exactly once, then the attempt is gone either way. */
export async function consumeVerifiedWalletAttempt(
  userId: string,
  attemptId: string,
): Promise<WalletIdentityClaims | null> {
  const key = `${KV_PREFIX}${attemptId}`;
  const attempt = await kvGet<WalletAttempt>(key);
  await kvDelete(key);
  if (!attempt || attempt.stage !== "verified" || attempt.userId !== userId || expired(attempt.createdAt)) {
    return null;
  }
  return attempt.claims;
}
