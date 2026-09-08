import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { buildWeeklyRun } from "@/lib/payroll/engine";
import { isoWeekOf, isoWeekId } from "@/lib/payroll/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/payroll/rebuild — (her)bereken de loonstroken van de eigen
// recente weken met goedgekeurde uren. Draft-runs zijn idempotent; een
// gefinaliseerde week wordt overgeslagen.
export async function POST(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });
    if (!profile) return NextResponse.json({ weeks: [] });

    const since = new Date();
    since.setDate(since.getDate() - 8 * 7);
    const rows = await prisma.timesheet.findMany({
      where: {
        freelancerId: profile.id,
        status: { in: ["APPROVED", "PAID"] },
        scheduledStart: { gte: since },
        billableMinutes: { gt: 0 },
      },
      select: { scheduledStart: true },
    });

    const weeks = [...new Set(rows.map((r) => isoWeekId(isoWeekOf(r.scheduledStart))))];
    const built: string[] = [];
    for (const w of weeks) {
      try {
        await buildWeeklyRun(w, p.userId);
        built.push(w);
      } catch {
        /* skip a week that cannot build */
      }
    }
    return NextResponse.json({ weeks: built });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
