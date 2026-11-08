import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { shiftId, urgency } = body as { shiftId: string; urgency?: "high" | "critical" };

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { requiredSkills: true, assignments: true },
    });

    if (!shift) {
      throw AppError.notFound("Shift not found");
    }

    if (shift.companyId !== company.id) {
      throw AppError.forbidden("Not your shift");
    }

    // Find all available workers with matching skills
    const candidates = await prisma.freelancerProfile.findMany({
      where: {
        skills: {
          some: {
            id: { in: shift.requiredSkills.map((s) => s.id) },
          },
        },
        assignments: {
          none: {
            shift: {
              startsAt: { lte: new Date(shift.endsAt) },
              endsAt: { gte: new Date(shift.startsAt) },
            },
          },
        },
      },
      select: { id: true, userId: true, hourlyRate: true },
      take: 20,
    });

    // Sort by hourly rate if budget constrained
    candidates.sort((a, b) => (a.hourlyRate || 0) - (b.hourlyRate || 0));

    return NextResponse.json({
      urgency: urgency || "normal",
      availableCandidates: candidates.length,
      candidates: candidates.slice(0, 5).map((c) => ({
        id: c.id,
        hourlyRate: c.hourlyRate,
      })),
      recommended: candidates.slice(0, 3),
      message: `Found ${candidates.length} available workers`,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
