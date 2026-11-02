import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { listComp, setComp } from "@/lib/billing/comp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/comp — accounts that use every paid feature for € 0.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ accounts: await listComp() }));

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  on: z.boolean(),
  reason: z.string().trim().max(200).default(""),
});

// POST { email, on, reason } — make an account (and the companies it runs) free, or paying again.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true, email: true, memberships: { where: { role: "HQ_ADMIN" }, select: { tenantId: true } } },
  });
  if (!user) throw AppError.notFound("Er is geen account met dit e-mailadres.");
  const accounts = await setComp({
    userId: user.id,
    email: user.email,
    tenantIds: user.memberships.map((m) => m.tenantId),
    on: input.on,
    reason: input.reason,
    by: { userId: principal.userId, name: principal.fullName },
  });
  return NextResponse.json({ accounts });
});
