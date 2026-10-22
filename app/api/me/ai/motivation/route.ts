import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { draftMotivation } from "@/lib/ai/writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  shiftId: z.string().min(1).max(128),
  draft: z.string().max(500).optional(),
});

// POST /api/me/ai/motivation — ✨ draft the "waarom jij?" motivation for a reactie, from the worker's own track record.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({ name: "ai-motivation", identifier: principal.userId, limit: 30, windowSeconds: 3600, message: "Even rustig aan met de schrijfhulp." });
    const input = schema.parse(await request.json().catch(() => ({})));

    const [user, profile, shift] = await Promise.all([
      prisma.user.findUnique({ where: { id: principal.userId }, select: { fullName: true } }),
      prisma.freelancerProfile.findUnique({
        where: { userId: principal.userId },
        select: { id: true, skills: { select: { skill: { select: { name: true } } }, take: 10 } },
      }),
      prisma.shift.findUnique({
        where: { id: input.shiftId },
        select: { title: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } },
      }),
    ]);
    if (!shift) throw AppError.notFound("Klus niet gevonden");

    const done = { cancelledAt: null, timesheet: { status: { in: ["APPROVED" as const, "PAID" as const] } } };
    const [completedShifts, completedForClient] = profile
      ? await Promise.all([
          prisma.shiftAssignment.count({ where: { freelancerId: profile.id, ...done } }),
          prisma.shiftAssignment.count({ where: { freelancerId: profile.id, ...done, shift: { branch: { tenantId: shift.branch.tenantId } } } }),
        ])
      : [0, 0];

    return NextResponse.json(
      await draftMotivation({
        firstName: (user?.fullName ?? "").split(" ")[0] ?? "",
        shiftTitle: shift.title,
        clientName: shift.branch.tenant.name,
        completedShifts,
        completedForClient,
        skills: profile?.skills.map((s) => s.skill.name) ?? [],
        draft: input.draft,
      }),
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
