import { createHmac, timingSafeEqual } from "node:crypto";
import { KycStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Didit integration - KYC / identity verification (v3 API).
//
//   POST {BASE}/v3/session/                     create a hosted session
//   GET  {BASE}/v3/session/{id}/decision/       fetch the decision
//   webhook -> verified with DIDIT_WEBHOOK_SECRET (HMAC-SHA256)
//
// Auth header: `X-API-Key: <DIDIT_API_KEY>`.
// ---------------------------------------------------------------------------

const WEBHOOK_TOLERANCE_SECONDS = 300;

export function isDiditEnabled(): boolean {
  return Boolean(env.DIDIT_API_KEY && env.DIDIT_WORKFLOW_ID);
}

function apiKey(): string {
  if (!env.DIDIT_API_KEY) throw AppError.upstream("DIDIT_API_KEY is not configured");
  return env.DIDIT_API_KEY;
}

// --- session lifecycle -------------------------------------------------

export interface CreateSessionInput {
  /** Our correlation id (freelancer user id / email). */
  vendorData: string;
  callbackUrl?: string;
  workflowId?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface DiditSession {
  sessionId: string;
  sessionToken: string | null;
  url: string;
  status: string;
  raw: unknown;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<DiditSession> {
  const workflowId = input.workflowId ?? env.DIDIT_WORKFLOW_ID;
  if (!workflowId) throw AppError.upstream("DIDIT_WORKFLOW_ID is not configured");

  const body: Record<string, unknown> = {
    workflow_id: workflowId,
    vendor_data: input.vendorData,
  };
  const callback = input.callbackUrl ?? env.DIDIT_CALLBACK_URL;
  if (callback) body.callback = callback;
  if (input.language) body.language = input.language;
  if (input.metadata) body.metadata = input.metadata;

  let res: Response;
  try {
    res = await fetch(`${env.DIDIT_BASE_URL.replace(/\/$/, "")}/v3/session/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error("didit create-session transport error", {
      error: (err as Error).message,
    });
    throw AppError.upstream("Didit is temporarily unreachable");
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status !== 201 && res.status !== 200) {
    const message =
      (data.message as string) ??
      (data.detail as string) ??
      (data.error as string) ??
      `Didit responded ${res.status}`;
    logger.error("didit create-session rejected", { status: res.status, message });
    throw AppError.upstream(`Kon geen verificatiesessie starten: ${message}`);
  }

  const sessionId = data.session_id as string | undefined;
  const url = (data.url ?? data.session_url ?? data.verification_url) as
    | string
    | undefined;
  if (!sessionId || !url) {
    throw AppError.upstream("Didit response missing session_id / url");
  }

  return {
    sessionId,
    sessionToken: (data.session_token as string) ?? null,
    url,
    status: (data.status as string) ?? "Not Started",
    raw: data,
  };
}

export interface DiditDecision {
  sessionId: string;
  status: string; // raw Didit status
  kyc: KycStatus;
  documentType: string | null;
  documentNumberHash: string | null;
  nfcChipVerified: boolean;
  livenessScore: number | null;
  faceMatchScore: number | null;
  expiresAt: string | null;
  vendorData: string | null;
  raw: unknown;
}

export async function getDecision(sessionId: string): Promise<DiditDecision> {
  let res: Response;
  try {
    res = await fetch(
      `${env.DIDIT_BASE_URL.replace(/\/$/, "")}/v3/session/${encodeURIComponent(
        sessionId,
      )}/decision/`,
      {
        headers: { "x-api-key": apiKey(), accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    logger.error("didit get-decision transport error", {
      error: (err as Error).message,
    });
    throw AppError.upstream("Didit is temporarily unreachable");
  }

  if (res.status === 404) throw AppError.notFound("Unknown Didit session");
  if (!res.ok) throw AppError.upstream(`Didit responded ${res.status}`);

  const data = (await res.json()) as Record<string, unknown>;
  return parseDecision(sessionId, data);
}

// --- decision parsing -------------------------------------------------

export function mapDiditStatus(status: string | undefined | null): KycStatus {
  switch ((status ?? "").toLowerCase().replace(/[\s_-]+/g, " ").trim()) {
    case "approved":
      return KycStatus.VERIFIED;
    case "declined":
      return KycStatus.REJECTED;
    case "kyc expired":
    case "expired":
      return KycStatus.EXPIRED;
    case "in review":
    case "in progress":
    case "awaiting user":
    case "resubmitted":
      return KycStatus.PENDING;
    case "not started":
      return KycStatus.NOT_STARTED;
    default:
      return KycStatus.PENDING;
  }
}

function firstArrayItem(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? (value[0] as Record<string, unknown>)
    : null;
}

export function parseDecision(
  sessionId: string,
  data: Record<string, unknown>,
): DiditDecision {
  const status = (data.status as string) ?? "In Progress";

  // v3 feature reports are plural arrays.
  const idv =
    firstArrayItem(data.id_verifications) ??
    firstArrayItem((data.kyc as Record<string, unknown>)?.id_verifications) ??
    (data.id_verification as Record<string, unknown>) ??
    null;
  const liveness =
    firstArrayItem(data.liveness_checks) ??
    (data.liveness as Record<string, unknown>) ??
    null;
  const faceMatch =
    firstArrayItem(data.face_matches) ??
    (data.face_match as Record<string, unknown>) ??
    null;

  const docNumber = idv?.document_number;
  return {
    sessionId,
    status,
    kyc: mapDiditStatus(status),
    documentType: (idv?.document_type as string) ?? null,
    documentNumberHash:
      typeof docNumber === "string" && docNumber
        ? createHmac("sha256", env.AUTH_SECRET).update(docNumber).digest("hex")
        : null,
    nfcChipVerified: Boolean(idv?.nfc_verified ?? idv?.chip_verified ?? false),
    livenessScore:
      typeof liveness?.score === "number" ? liveness.score / 100 : null,
    faceMatchScore:
      typeof faceMatch?.score === "number" ? faceMatch.score / 100 : null,
    expiresAt: (data.expires_at as string) ?? null,
    vendorData: (data.vendor_data as string) ?? null,
    raw: data,
  };
}

// --- webhook signature verification ---------------------------------

function shortenFloats(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(shortenFloats);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = shortenFloats(v);
    return out;
  }
  if (
    typeof input === "number" &&
    !Number.isInteger(input) &&
    input === Math.floor(input)
  ) {
    return Math.floor(input);
  }
  return input;
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj ?? null);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return `{${keys
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify(
            (obj as Record<string, unknown>)[k],
          )}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(obj);
}

function hmacHex(payload: string, secret: string): Buffer {
  return Buffer.from(
    createHmac("sha256", secret).update(payload, "utf-8").digest("hex"),
    "hex",
  );
}

function safeEqualHex(expected: Buffer, providedHex: string): boolean {
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  return (
    expected.length > 0 &&
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export interface WebhookHeaders {
  "x-signature"?: string | null;
  "x-signature-v2"?: string | null;
  "x-signature-simple"?: string | null;
}

export interface WebhookVerification {
  valid: boolean;
  method: "simple" | "v2" | "original" | null;
  body: Record<string, unknown>;
}

/**
 * Verify an inbound Didit webhook. Tries the three published signature schemes
 * (V2 sorted-keys, Simple field-canonical, Original raw-body) and enforces the
 * ±5 min timestamp window from `created_at`.
 */
export function verifyWebhook(
  rawBody: string,
  headers: WebhookHeaders,
): WebhookVerification {
  if (!env.DIDIT_WEBHOOK_SECRET) {
    throw AppError.upstream("DIDIT_WEBHOOK_SECRET is not configured");
  }
  const secret = env.DIDIT_WEBHOOK_SECRET;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { valid: false, method: null, body: {} };
  }

  const timestamp = Number(body.created_at ?? body.timestamp ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, method: null, body };
  }

  const v2 = headers["x-signature-v2"];
  if (v2 && safeEqualHex(hmacHex(stableStringify(shortenFloats(body)), secret), v2)) {
    return { valid: true, method: "v2", body };
  }

  const simple = headers["x-signature-simple"];
  if (simple) {
    const canonical = [
      String(body.timestamp ?? body.created_at ?? ""),
      String(body.session_id ?? ""),
      String(body.status ?? ""),
      String(body.webhook_type ?? ""),
    ].join(":");
    if (safeEqualHex(hmacHex(canonical, secret), simple)) {
      return { valid: true, method: "simple", body };
    }
  }

  const original = headers["x-signature"];
  if (original && safeEqualHex(hmacHex(rawBody, secret), original)) {
    return { valid: true, method: "original", body };
  }

  return { valid: false, method: null, body };
}
