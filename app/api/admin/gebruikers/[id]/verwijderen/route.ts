import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/gebruikers/<id>/verwijderen — anonymises the account rather
// than a hard delete: invoices, timesheets and audit entries keep pointing at
// a valid row (legally required retention), but the person's data is gone and
// the account can never log in again. Irreversible.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, email: true } });
  if (!user) throw AppError.notFound("Gebruiker niet gevonden");
  if (user.email.endsWith("@verwijderd.zekerflex.invalid")) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const anonEmail = `verwijderd-${params.id}@verwijderd.zekerflex.invalid`;
  await prisma.user.update({
    where: { id: params.id },
    data: {
      fullName: "Verwijderde gebruiker",
      email: anonEmail,
      phone: null,
      passwordHash: null,
      disabledAt: new Date(),
    },
  });

  await recordAudit({
    category: "SECURITY",
    action: "admin.user.deleted",
    severity: "critical",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} verwijderde (anonimiseerde) het account van ${user.fullName} (${user.email})`,
    targetType: "user",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true });
});
