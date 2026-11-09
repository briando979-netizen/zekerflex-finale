import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { stuurHerinneringNu } from "@/lib/onboarding/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/onboarding/<id>/herinnering — stuurt nu één herinnering ("maak je account af") aan dit account,
// buiten de dagen-planning om. Dezelfde mail en regels als de dagelijkse taak (lib/onboarding/reminders.ts).
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const exists = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw AppError.notFound("Account niet gevonden.");

  const result = await stuurHerinneringNu(params.id);
  if (!result.sent) return NextResponse.json({ ok: false, message: result.reden ?? "Er is geen herinnering verstuurd." }, { status: 409 });

  await recordAudit({
    category: "ADMIN",
    action: "admin.onboarding.reminder_sent",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Een beheerder stuurde een onboarding-herinnering",
    targetType: "user",
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
});
