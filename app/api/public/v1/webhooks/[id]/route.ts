import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/public/v1/webhooks/<id> — verwijder een eigen webhook-abonnement
// (de wachtende leveringen gaan mee, onDelete: Cascade). Scope "webhooks:manage";
// de sleutel moet aan dezelfde organisatie hangen als het abonnement.
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "webhooks:manage");
    if (!key.tenantId) {
      return NextResponse.json(
        { error: { code: "PRECONDITION_FAILED", message: "Sleutel is niet aan een organisatie gekoppeld" } },
        { status: 412, headers: rateLimitHeaders(rate) },
      );
    }
    const { id } = await props.params;
    // tenantId in de where: je kunt alleen je eigen abonnementen verwijderen.
    const uitkomst = await prisma.webhookSubscription.deleteMany({ where: { id, tenantId: key.tenantId } });
    if (uitkomst.count === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Webhook-abonnement niet gevonden" } },
        { status: 404, headers: rateLimitHeaders(rate) },
      );
    }
    await recordAudit({
      category: "SECURITY",
      action: "api.webhook.deleted",
      actorLabel: `api-key:${key.id}`,
      summary: "Webhook-abonnement via de API verwijderd",
      targetType: "webhookSubscription",
      targetId: id,
      metadata: { tenantId: key.tenantId },
    });
    return NextResponse.json({ data: { id, deleted: true } }, { headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
