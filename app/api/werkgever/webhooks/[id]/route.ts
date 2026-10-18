import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { deleteWebhook, rotateWebhookSecret, testWebhook, updateWebhook, WEBHOOK_EVENTS, type WebhookEventKey } from "@/lib/webhooks/manage";
import { employerTenant } from "@/lib/webhooks/employer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventKeys = WEBHOOK_EVENTS.map((e) => e.key) as [WebhookEventKey, ...WebhookEventKey[]];
const patchSchema = z.object({ active: z.boolean().optional(), eventTypes: z.array(z.enum(eventKeys)).min(1).max(10).optional(), url: z.string().url().max(500).optional() });

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/werkgever/webhooks/:id — pause/resume, change events or URL.
export async function PATCH(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { tenantId } = await employerTenant(true);
    const { id } = await params;
    const p = patchSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ webhook: await updateWebhook(tenantId, id, { active: p.active, eventTypes: p.eventTypes, url: p.url }) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/werkgever/webhooks/:id { action: "test" | "rotate" } — signed test ping, or a new signing secret (shown once).
export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await employerTenant(true);
    const { id } = await params;
    const { action } = z.object({ action: z.enum(["test", "rotate"]) }).parse(await request.json().catch(() => ({})));
    if (action === "test") return NextResponse.json(await testWebhook(tenantId, id));
    const secret = await rotateWebhookSecret(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "employer.webhook.secret_rotated", actorUserId: principal.userId, summary: `Webhook-geheim vernieuwd (${id})`, targetType: "webhook", targetId: id });
    return NextResponse.json({ secret });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/werkgever/webhooks/:id — remove the endpoint.
export async function DELETE(_request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await employerTenant(true);
    const { id } = await params;
    await deleteWebhook(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "employer.webhook.deleted", actorUserId: principal.userId, summary: `Webhook verwijderd (${id})`, targetType: "webhook", targetId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
