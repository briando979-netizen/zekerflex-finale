import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { encryptWebhookSecret } from "@/lib/webhooks/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ url: z.string().url(), eventTypes: z.array(z.enum(["shift.matched", "freelancer.checked_in", "timesheet.approved", "dispute.opened", "invoice.issued"])).min(1).max(20) });

// POST /api/public/v1/webhooks — register a webhook subscription. Authenticate
// with `Authorization: Bearer zf_live_...` (see /admin/integraties). Requires
// the "webhooks:manage" scope; the key must be tenant-scoped.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "webhooks:manage");
    if (!key.tenantId) {
      return NextResponse.json(
        { error: { code: "PRECONDITION_FAILED", message: "Sleutel is niet aan een organisatie gekoppeld" } },
        { status: 412, headers: rateLimitHeaders(rate) },
      );
    }
    const input = schema.parse(await request.json());
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const subscription = await prisma.webhookSubscription.create({ data: { tenantId: key.tenantId, url: input.url, eventTypes: input.eventTypes, secretCiphertext: encryptWebhookSecret(secret) }, select: { id: true, url: true, eventTypes: true, createdAt: true } });
    return NextResponse.json({ data: subscription, secret }, { status: 201, headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}