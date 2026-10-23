import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { listClawbacks, openExposureCents, setClawbackStatus, type ClawbackStatus } from "@/lib/billing/clawback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/clawbacks — terugvorderingen + open exposure (voorgeschoten geld).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [clawbacks, exposureCents] = await Promise.all([listClawbacks(), openExposureCents()]);
  return NextResponse.json({ clawbacks, exposureCents });
});

const schema = z.object({ invoiceId: z.string().min(1), status: z.enum(["open", "herincasso", "opgelost", "afgeschreven"]) });

// POST /api/admin/clawbacks — status van een terugvordering bijwerken.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { invoiceId, status } = schema.parse(await request.json().catch(() => ({})));
  await setClawbackStatus(invoiceId, status as ClawbackStatus);
  await recordAudit({ category: "BILLING", action: "clawback.status", actorUserId: principal.userId, actorLabel: "user", summary: `Terugvordering ${invoiceId} → ${status}`, targetType: "invoice", targetId: invoiceId }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
