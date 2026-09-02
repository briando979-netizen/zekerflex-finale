import { PaymentStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type {
  SepaInstantPayoutRequest,
  SepaInstantPayoutResult,
} from "@/types/billing";

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** ISO 7064 mod-97-10 IBAN checksum validation. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!IBAN_RE.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Deterministic End-to-End id so retries of the same payout are idempotent. */
export function payoutEndToEndId(invoiceId: string): string {
  return `ZF-${invoiceId}`.slice(0, 35);
}

/**
 * Trigger an instant (SCT Inst) SEPA credit transfer through the configured
 * bank/PSP. The provider is expected to be idempotent on `endToEndId`; we still
 * treat a 409 as a success (already submitted). Settlement confirmation arrives
 * asynchronously via webhook and flips the Payment to SETTLED.
 */
export async function triggerInstantPayout(
  req: SepaInstantPayoutRequest,
): Promise<SepaInstantPayoutResult> {
  if (!isValidIban(req.creditorIban)) {
    throw AppError.validation("Creditor IBAN failed checksum validation");
  }
  if (req.amountCents <= 0) {
    throw AppError.validation("Payout amount must be positive");
  }
  if (!env.SEPA_API_BASE_URL || !env.SEPA_API_KEY || !env.SEPA_CREDITOR_IBAN) {
    throw AppError.upstream("Instant SEPA provider is not configured");
  }

  const payload = {
    paymentScheme: "SEPA_INSTANT",
    endToEndId: req.endToEndId,
    amount: { value: (req.amountCents / 100).toFixed(2), currency: req.currency },
    debtor: { iban: env.SEPA_CREDITOR_IBAN, name: env.SEPA_CREDITOR_NAME },
    creditor: { iban: req.creditorIban.replace(/\s+/g, ""), name: req.creditorName },
    remittanceInformationUnstructured: req.remittanceInfo.slice(0, 140),
    requestedExecutionDate: "NOW",
  };

  let res: Response;
  try {
    res = await fetch(`${env.SEPA_API_BASE_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SEPA_API_KEY}`,
        "idempotency-key": req.endToEndId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error("SEPA request transport error", {
      endToEndId: req.endToEndId,
      error: (err as Error).message,
    });
    throw AppError.paymentFailed("Could not reach the payment provider");
  }

  if (res.status === 409) {
    return { status: PaymentStatus.SUBMITTED, providerRef: null, acceptedAt: null };
  }

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    logger.error("SEPA payout rejected", {
      endToEndId: req.endToEndId,
      httpStatus: res.status,
      providerCode: body.error?.code,
    });
    return {
      status: PaymentStatus.FAILED,
      providerRef: body.id ?? null,
      acceptedAt: null,
      failureCode: body.error?.code ?? `HTTP_${res.status}`,
    };
  }

  const settled = body.status === "SETTLED" || body.status === "ACSC";
  return {
    status: settled ? PaymentStatus.SETTLED : PaymentStatus.SUBMITTED,
    providerRef: body.id ?? null,
    acceptedAt: new Date().toISOString(),
  };
}
