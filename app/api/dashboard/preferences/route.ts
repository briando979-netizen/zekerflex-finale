import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  notifyNewShifts: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  maxDistance: z.number().min(1).max(100).optional(),
  minHourlyRate: z.number().min(0).optional(),
  preferredBranches: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      include: { preferredBranches: true },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    return NextResponse.json({
      id: freelancer.id,
      notifyNewShifts: freelancer.notifyNewShifts ?? true,
      notifyMessages: freelancer.notifyMessages ?? true,
      maxDistance: freelancer.maxDistance,
      minHourlyRate: freelancer.minHourlyRate,
      preferredBranches: freelancer.preferredBranches.map((b) => ({
        id: b.branchId,
        name: b.branchId,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const data = preferencesSchema.parse(await request.json());

    const updated = await prisma.freelancerProfile.update({
      where: { id: freelancer.id },
      data: {
        notifyNewShifts: data.notifyNewShifts,
        notifyMessages: data.notifyMessages,
        maxDistance: data.maxDistance,
        minHourlyRate: data.minHourlyRate,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Preferences updated",
      preferences: {
        notifyNewShifts: updated.notifyNewShifts,
        notifyMessages: updated.notifyMessages,
        maxDistance: updated.maxDistance,
        minHourlyRate: updated.minHourlyRate,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
