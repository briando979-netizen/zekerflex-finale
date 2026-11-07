import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "FILLED", "CANCELLED"]).optional(),
  branchId: z.string().optional(),
  skip: z.number().default(0),
  take: z.number().default(20),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("No organization linked");
    }

    const query = request.nextUrl.searchParams.get("query");
    const status = request.nextUrl.searchParams.get("status");
    const branchId = request.nextUrl.searchParams.get("branchId");
    const skip = parseInt(request.nextUrl.searchParams.get("skip") || "0");
    const take = Math.min(parseInt(request.nextUrl.searchParams.get("take") || "20"), 100);

    const where: any = {
      branch: { tenantId },
    };

    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          branch: { select: { name: true } },
          assignments: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.shift.count({ where }),
    ]);

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        title: s.title,
        branch: s.branch.name,
        status: s.status,
        startsAt: s.startsAt,
        positions: s.positions,
        filledPositions: s.assignments.length,
        hourlyRateCents: s.hourlyRateCents,
      })),
      total,
      page: Math.floor(skip / take),
      pageSize: take,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
