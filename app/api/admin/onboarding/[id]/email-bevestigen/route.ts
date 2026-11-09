import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().trim().min(5, "Geef een reden van minstens 5 tekens.").max(300) });

// POST /api/admin/onboarding/<id>/email-bevestigen — zet het e-mailadres met de hand op bevestigd (bijvoorbeeld
// nadat de gebruiker via een ander kanaal aantoonbaar zijn adres bevestigde). De reden komt in het auditspoor.
// Er gaat geen welkomstmail uit: de gebruiker heeft de mailbox niet zelf bevestigd.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { reason } = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, emailVerifiedAt: true, disabledAt: true } });
  if (!user) throw AppError.notFound("Account niet gevonden.");
  if (user.disabledAt) throw AppError.precondition("Dit account is geblokkeerd of verwijderd.");
  if (user.emailVerifiedAt) throw AppError.precondition("Het e-mailadres is al bevestigd.");

  const flipped = await prisma.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  if (flipped.count === 1) {
    await recordAudit({
      category: "ADMIN",
      action: "admin.onboarding.email_marked_verified",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Een beheerder zette een e-mailadres met de hand op bevestigd. Reden: ${reason}`,
      targetType: "user",
      targetId: user.id,
      metadata: { reason },
    });
  }
  return NextResponse.json({ ok: true });
});
