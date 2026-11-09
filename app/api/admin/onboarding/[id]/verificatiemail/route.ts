import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { sendVerificationEmail } from "@/lib/auth/email-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/onboarding/<id>/verificatiemail — stuurt de verificatiemail (link + code) opnieuw,
// voor een account dat zijn e-mailadres nog niet bevestigde. Dezelfde wachttijd als voor de gebruiker zelf.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, email: true, fullName: true, emailVerifiedAt: true, disabledAt: true } });
  if (!user) throw AppError.notFound("Account niet gevonden.");
  if (user.disabledAt) throw AppError.precondition("Dit account is geblokkeerd of verwijderd.");
  if (user.emailVerifiedAt) throw AppError.precondition("Het e-mailadres is al bevestigd.");

  const result = await sendVerificationEmail(user.id, user.email, user.fullName);
  if (!result.sent) {
    return NextResponse.json({ ok: false, message: `De vorige mail ging net weg. Probeer het over ${result.cooldownSeconds ?? 45} seconden opnieuw.` }, { status: 429 });
  }

  await recordAudit({
    category: "ADMIN",
    action: "admin.onboarding.verification_mail_resent",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Een beheerder stuurde de verificatiemail opnieuw",
    targetType: "user",
    targetId: user.id,
    metadata: { delivered: result.delivered, transport: result.transport },
  });
  return NextResponse.json({ ok: true, delivered: result.delivered });
});
