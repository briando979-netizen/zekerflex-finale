import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which department (room) an audited event belongs to — drives the office simulation.
function roomFor(category: string, action: string): string {
  if (action.startsWith("bank.") || action.startsWith("fastpay.")) return "bank";
  if (action.startsWith("shop.")) return "shop";
  if (action.startsWith("webchat.") || action.startsWith("mail") || action.includes("newsletter")) return "support";
  if (category === "SALES" || action.startsWith("uitzend.")) return "sales";
  if (category === "TIMESHEET" || category === "MATCHING") return "operations";
  if (category === "BILLING") return "finance";
  if (category === "KYC" || category === "AGREEMENT" || category === "DISPUTE" || category === "SECURITY") return "legal";
  if (category === "ORCHESTRATION") return "ai";
  return "hq";
}

// GET /api/admin/office — the last real events (from the audit trail), mapped to rooms.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since }, NOT: { action: { startsWith: "auth." } } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, category: true, action: true, summary: true, severity: true, actorLabel: true, createdAt: true },
  });
  const counts: Record<string, number> = {};
  const events = rows.map((r) => {
    const room = roomFor(r.category, r.action);
    counts[room] = (counts[room] ?? 0) + 1;
    return { id: r.id, room, action: r.action, summary: r.summary.slice(0, 140), severity: r.severity, by: r.actorLabel, at: r.createdAt.toISOString() };
  });
  return NextResponse.json({ events, counts, serverTime: new Date().toISOString() });
});
