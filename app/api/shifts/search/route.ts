import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  location: z.string().optional(),
  radius: z.number().optional().default(25),
  minRate: z.number().optional(),
  maxRate: z.number().optional(),
  type: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().optional().default(1),
  sort: z.enum(["newest", "distance", "rate", "match"]).optional().default("newest"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const filters = searchSchema.parse(body);

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer profile not found");
    }

    const limit = 20;
    const offset = (filters.page - 1) * limit;

    let where: any = {
      status: "OPEN",
      startsAt: { gte: new Date() },
      NOT: { assignments: { some: { freelancerId: freelancer.id } } },
    };

    if (filters.startDate) {
      where.startsAt = { gte: new Date(filters.startDate) };
    }

    if (filters.endDate) {
      where.endsAt = { lte: new Date(filters.endDate) };
    }

    if (filters.minRate) {
      where.hourlyRate = { gte: filters.minRate };
    }

    if (filters.maxRate) {
      if (where.hourlyRate) {
        where.hourlyRate.lte = filters.maxRate;
      } else {
        where.hourlyRate = { lte: filters.maxRate };
      }
    }

    if (filters.type) {
      where.type = filters.type;
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: { company: true },
      skip: offset,
      take: limit,
      orderBy:
        filters.sort === "rate"
          ? { hourlyRate: "desc" }
          : filters.sort === "distance"
            ? { id: "asc" }
            : { createdAt: "desc" },
    });

    const total = await prisma.shift.count({ where });

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        company: s.company.name,
        title: s.title || "Shift",
        location: s.locatie,
        startTime: s.startsAt,
        endTime: s.endsAt,
        hourlyRate: s.hourlyRate,
        description: s.description,
        type: s.type,
      })),
      pagination: {
        page: filters.page,
        limit,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
