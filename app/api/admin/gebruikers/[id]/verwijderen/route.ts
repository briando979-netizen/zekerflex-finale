import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/gebruikers/<id>/verwijderen — anonymises the account rather
// than a hard delete: invoices, timesheets and audit entries keep pointing at
// a valid row (legally required retention), but the person's data is gone and
// the account can never log in again. Irreversible.
export async function POST(_request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
