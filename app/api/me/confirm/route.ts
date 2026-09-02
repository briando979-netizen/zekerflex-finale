import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import { confirmAssignment } from "@/lib/prefs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/confirm { assignmentId } — the freelancer confirms attendance.
// Filesystem only (storage/prefs). Read-only DB lookup to validate ownership.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { assignmentId } = z
      .object({ assignmentId: z.string().min(1).max(128) })
      .parse(await request.json().catch(() => ({})));

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Geen freelancer-profiel");

    const assignment = await prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, freelancerId: profile.id, cancelledAt: null },
      select: { id: true },
    });
    if (!assignment) throw AppError.notFound("Dienst niet gevonden");

    await confirmAssignment(principal.userId, assignmentId);
    return NextResponse.json({ ok: true, confirmedAt: new Date().toISOString() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
