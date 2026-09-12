import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { anonymizeUser } from "@/lib/privacy/anonymize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/gebruikers/<id>/verwijderen — AVG art. 17 erasure.
// Deep-anonymises the account (see lib/privacy/anonymize.ts): every erasable
// identifier across user, freelancer profile, KYC, devices, documents and the
// audit log is stripped. Data under a statutory retention duty (invoices,
// timesheets, model agreements, payroll) is kept and listed in the response as
// `retained`. Irreversible.
export const POST = withAdminAccess<{ id: string }>(
  ["PLATFORM_ADMIN"],
  async (_request, { params, principal }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) throw AppError.notFound("Gebruiker niet gevonden");

    const report = await anonymizeUser(params.id, {
      actorUserId: principal.userId,
      reason: `verwijderd via admin door ${principal.email}`,
    });

    return NextResponse.json({ ok: true, ...report });
  },
);
