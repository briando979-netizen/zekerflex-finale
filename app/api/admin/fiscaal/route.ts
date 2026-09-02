import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { listFiscalSummaries } from "@/lib/fiscal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/fiscaal — worker fiscal profiles for correct invoicing/payroll.
// Reads storage/fiscal + a read-only user lookup. No writes.
//
// Platform-admin only: fiscal data (btw-/KVK-nummer) is sensitive and used to
// be visible to any employer HQ_ADMIN. The btw-nummer itself is masked here —
// GET /api/admin/fiscaal/reveal opens one record on click, audited.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const summaries = await listFiscalSummaries();
    const ids = summaries.map((s) => s.userId);
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const counts = {
      total: summaries.length,
      complete: summaries.filter((r) => r.complete).length,
      zzp: summaries.filter((r) => r.workerKind === "zzp").length,
      flexwerker: summaries.filter((r) => r.workerKind === "flexwerker").length,
      uitzendkracht: summaries.filter((r) => r.workerKind === "uitzendkracht").length,
      vatInvalid: summaries.filter((r) => r.vatNumber && !r.vatValid).length,
    };

    const rows = summaries.map((s) => ({
      ...s,
      vatNumber: null as string | null, // masked — reveal via POST /api/admin/fiscaal/reveal
      hasVat: Boolean(s.vatNumber),
      name: byId.get(s.userId)?.fullName ?? "Onbekend",
      email: byId.get(s.userId)?.email ?? null,
    }));

    return NextResponse.json({ rows, counts });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
