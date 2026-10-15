import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/invoices/stats — platform-brede factuurcijfers voor het
// Live kantoor (en eventuele andere admin-widgets). Zelfde groupBy als
// /admin/facturen zelf gebruikt, alleen als JSON voor client-fetches.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const totals = await prisma.invoice.groupBy({ by: ["status"], _sum: { totalCents: true }, _count: true });
  const outstandingCents = totals.find((t) => t.status === "ISSUED")?._sum.totalCents ?? 0;
  const paidCents = totals.find((t) => t.status === "PAID")?._sum.totalCents ?? 0;
  const count = totals.reduce((s, t) => s + t._count, 0);
  return NextResponse.json({ outstandingCents, paidCents, count });
});
