import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { createWebhook, listWebhooks, recentDeliveries, WEBHOOK_EVENTS, type WebhookEventKey } from "@/lib/webhooks/manage";
import { employerTenant } from "@/lib/webhooks/employer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventKeys = WEBHOOK_EVENTS.map((e) => e.key) as [WebhookEventKey, ...WebhookEventKey[]];
const schema = z.object({ url: z.string().url().max(500), eventTypes: z.array(z.enum(eventKeys)).min(1).max(10) });

// GET /api/werkgever/webhooks — endpoints, available events and the recent delivery log.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await employerTenant(false);
    const [webhooks, deliveries] = await Promise.all([listWebhooks(tenantId), recentDeliveries(tenantId)]);
    return NextResponse.json({ webhooks, deliveries, events: WEBHOOK_EVENTS });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/werkgever/webhooks — add an endpoint; the signing secret is returned once.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await employerTenant(true);
    const input = schema.parse(await request.json().catch(() => ({})));
    const created = await createWebhook(tenantId, input.url, input.eventTypes);
    await recordAudit({ category: "COMPANY", action: "employer.webhook.created", actorUserId: principal.userId, summary: `Webhook toegevoegd: ${input.url} (${input.eventTypes.join(", ")})`, targetType: "webhook", targetId: created.id });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
