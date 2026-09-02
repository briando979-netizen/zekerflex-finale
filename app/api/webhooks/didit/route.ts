import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyWebhook } from "@/lib/integrations/didit";
import { applyWebhookPayload } from "@/lib/kyc/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/didit
 *
 * Public endpoint. Signature-verified with DIDIT_WEBHOOK_SECRET, logged for
 * audit/idempotency, then applied to the freelancer's KYC state. Always returns
 * 2xx once the signature is valid so Didit does not retry a processed event;
 * an invalid signature gets 401.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/webhooks/didit" });
  const rawBody = await request.text();

  let verification: ReturnType<typeof verifyWebhook>;
  try {
    verification = verifyWebhook(rawBody, {
      "x-signature": request.headers.get("x-signature"),
      "x-signature-v2": request.headers.get("x-signature-v2"),
      "x-signature-simple": request.headers.get("x-signature-simple"),
    });
  } catch (err) {
    // Misconfiguration (no secret) - 500 so it is noticed, Didit will retry.
    log.error("webhook verification error", { error: (err as Error).message });
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const body = verification.body;
  const sessionId = String(body.session_id ?? "unknown");

  await prisma.diditWebhookEvent
    .create({
      data: {
        sessionId,
        status: String(body.status ?? "unknown"),
        webhookType: body.webhook_type ? String(body.webhook_type) : null,
        signatureValid: verification.valid,
        signatureMethod: verification.method,
        rawPayload: (body ?? {}) as Prisma.InputJsonValue,
      },
    })
    .catch((err) => log.error("failed to log webhook", { error: err.message }));

  if (!verification.valid) {
    log.warn("rejected didit webhook (bad signature)", { sessionId });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const result = await applyWebhookPayload(body);
    return NextResponse.json({
      ok: true,
      matched: result.matched,
      kycStatus: result.kycStatus,
    });
  } catch (err) {
    log.error("failed to apply didit webhook", {
      sessionId,
      error: (err as Error).message,
    });
    // 200 so Didit does not hammer us; the event is persisted for replay.
    return NextResponse.json({ ok: false, acknowledged: true });
  }
}
