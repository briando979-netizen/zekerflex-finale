import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { createWebhook } from "@/lib/webhooks/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ url: z.string().url(), eventTypes: z.array(z.enum(["shift.matched", "freelancer.checked_in", "timesheet.approved", "dispute.opened", "invoice.issued"])).min(1).max(20) });

// GET /api/public/v1/webhooks — je webhook-abonnementen (zonder het geheim).
// Scope "webhooks:manage"; de sleutel moet aan een organisatie hangen.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "webhooks:manage");
    if (!key.tenantId) {
      return NextResponse.json(
        { error: { code: "PRECONDITION_FAILED", message: "Sleutel is niet aan een organisatie gekoppeld" } },
        { status: 412, headers: rateLimitHeaders(rate) },
      );
    }
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: { tenantId: key.tenantId },
      select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ data: subscriptions }, { headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}

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
    // createWebhook doet de veilige URL-controle (https, geen intern adres, geen naam zonder punt) en de grens van 20 (lib/webhooks/manage.ts).
    const { id, secret } = await createWebhook(key.tenantId, input.url, input.eventTypes);
    const subscription = await prisma.webhookSubscription.findUnique({ where: { id }, select: { id: true, url: true, eventTypes: true, createdAt: true } });
    return NextResponse.json({ data: subscription, secret }, { status: 201, headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}