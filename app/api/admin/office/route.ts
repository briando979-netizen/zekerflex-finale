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

// Which customer an event belongs to (via its target), so the 3D city can send
// its vehicle out of that customer's building. Unknown targets stay null.
async function tenantsFor(rows: { targetType: string | null; targetId: string | null }[]): Promise<Map<string, string>> {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId as string))];
  const [shifts, timesheets, invoices] = await Promise.all([
    prisma.shift.findMany({ where: { id: { in: ids("shift") } }, select: { id: true, branch: { select: { tenantId: true } } } }),
    prisma.timesheet.findMany({ where: { id: { in: ids("timesheet") } }, select: { id: true, branch: { select: { tenantId: true } } } }),
    prisma.invoice.findMany({ where: { id: { in: ids("invoice") } }, select: { id: true, recipientTenantId: true } }),
  ]);
  const out = new Map<string, string>();
  for (const s of shifts) out.set(`shift:${s.id}`, s.branch.tenantId);
  for (const t of timesheets) out.set(`timesheet:${t.id}`, t.branch.tenantId);
  for (const i of invoices) if (i.recipientTenantId) out.set(`invoice:${i.id}`, i.recipientTenantId);
  for (const r of rows) if (r.targetType === "tenant" && r.targetId) out.set(`tenant:${r.targetId}`, r.targetId);
  return out;
}

// GET /api/admin/office — the last real events (from the audit trail), mapped to rooms.
// ?limit= up to 200 for the 24-hour replay in the 3D city (default 40).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get("limit")) || 40));
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since }, NOT: { action: { startsWith: "auth." } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, category: true, action: true, summary: true, severity: true, actorLabel: true, targetType: true, targetId: true, createdAt: true },
  });
  const tenants = await tenantsFor(rows);
  const counts: Record<string, number> = {};
  const events = rows.map((r) => {
    const room = roomFor(r.category, r.action);
    counts[room] = (counts[room] ?? 0) + 1;
    const tenantId = r.targetType && r.targetId ? (tenants.get(`${r.targetType}:${r.targetId}`) ?? null) : null;
    return { id: r.id, room, action: r.action, summary: r.summary.slice(0, 140), severity: r.severity, by: r.actorLabel, tenantId, at: r.createdAt.toISOString() };
  });
  return NextResponse.json({ events, counts, serverTime: new Date().toISOString() });
});
