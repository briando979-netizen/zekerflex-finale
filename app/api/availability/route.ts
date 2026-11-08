import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const slotSchema = z.object({
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  startTime: z.string(),
  endTime: z.string(),
  repeating: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const slots = await prisma.availabilitySlot.findMany({
      where: { freelancerId: freelancer.id },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });

    const grouped = slots.reduce(
      (acc, slot) => {
        if (!acc[slot.day]) {
          acc[slot.day] = [];
        }
        acc[slot.day].push({
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return NextResponse.json({ availability: grouped });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const body = await request.json();
    const slot = slotSchema.parse(body);

    const created = await prisma.availabilitySlot.create({
      data: {
        ...slot,
        freelancerId: freelancer.id,
      },
    });

    return NextResponse.json({ slot: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const slotId = request.nextUrl.searchParams.get("slotId");

    if (!slotId) {
      throw AppError.validation("Slot ID required");
    }

    await prisma.availabilitySlot.delete({
      where: { id: slotId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
