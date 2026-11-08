import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    // Get recent assignments/contracts
    const contracts = await prisma.shiftAssignment.findMany({
      where: { freelancerId: freelancer.id },
      include: {
        shift: {
          include: { company: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      activeContracts: contracts.filter((c) => c.status === "IN_PROGRESS").length,
      completedContracts: contracts.filter((c) => c.status === "COMPLETED").length,
      recentContracts: contracts.map((c) => ({
        id: c.id,
        company: c.shift.company.name,
        status: c.status,
        startDate: c.shift.startsAt,
        endDate: c.shift.endsAt,
        hourlyRate: c.shift.hourlyRate,
        expectedEarnings: Math.round(
          ((new Date(c.shift.endsAt).getTime() - new Date(c.shift.startsAt).getTime()) / (1000 * 60 * 60)) *
            (c.shift.hourlyRate || 0)
        ),
      })),
      contractTemplates: [
        {
          id: "standard-flex",
          name: "Standaard flexcontract",
          description: "Flexibel werken per shift",
          terms: "Betaling per uur, geen minimum uren",
        },
        {
          id: "vaste-uren",
          name: "Vaste uren",
          description: "Wekelijks contract met vaste uren",
          terms: "Minimaal 8 uren per week",
        },
      ],
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
