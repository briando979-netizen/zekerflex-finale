import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const {
      query,
      filters: { minRating, maxRate, minExperience, verified, skills },
    } = body as {
      query?: string;
      filters?: {
        minRating?: number;
        maxRate?: number;
        minExperience?: number;
        verified?: boolean;
        skills?: string[];
      };
    };

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    // Build dynamic filter
    const workers = await prisma.freelancerProfile.findMany({
      where: {
        ...(minRating && {
          // Would filter by average rating in real implementation
        }),
        ...(maxRate && { hourlyRate: { lte: maxRate } }),
        ...(verified !== undefined && { verified }),
        ...(skills && skills.length > 0 && {
          skills: { some: { id: { in: skills } } },
        }),
      },
      include: { skills: true, assignments: { select: { id: true } } },
      take: 100,
    });

    return NextResponse.json({
      results: workers.map((w) => ({
        id: w.id,
        hourlyRate: w.hourlyRate,
        skills: w.skills.map((s) => s.name),
        experience: w.assignments.length,
        verified: w.verified,
      })),
      total: workers.length,
      appliedFilters: {
        minRating,
        maxRate,
        minExperience,
        verified,
        skillCount: skills?.length,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
