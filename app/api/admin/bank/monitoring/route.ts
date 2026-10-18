import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { reviewAlert, scanAlerts } from "@/lib/bank/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bank/monitoring — transaction-monitoring signals (last 7 days).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ alerts: await scanAlerts() }));

// POST /api/admin/bank/monitoring — mark a signal reviewed, with a note.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { id, note } = z.object({ id: z.string().min(3).max(120), note: z.string().trim().min(1).max(300) }).parse(await request.json().catch(() => ({})));
  await reviewAlert(id, principal.fullName, note);
  await recordAudit({ category: "ADMIN", action: "bank.aml_reviewed", actorUserId: principal.userId, summary: `Signaal ${id} beoordeeld: ${note}`, targetType: "bank-alert", targetId: id });
  return NextResponse.json({ ok: true });
});
