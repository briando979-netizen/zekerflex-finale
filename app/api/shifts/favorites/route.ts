import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const favorites = await prisma.shiftFavorite.findMany({
      where: { userId: principal.userId },
      include: { shift: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      favorites: favorites.map((f) => ({
        id: f.id,
        shiftId: f.shift.id,
        company: f.shift.company.name,
        location: f.shift.locatie,
        startTime: f.shift.startsAt,
        hourlyRate: f.shift.hourlyRate,
        savedAt: f.createdAt,
      })),
      total: favorites.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const shiftId = request.nextUrl.searchParams.get("shiftId");

    if (!shiftId) {
      throw AppError.validation("Shift ID required");
    }

    const exists = await prisma.shiftFavorite.findUnique({
      where: {
        userId_shiftId: {
          userId: principal.userId,
          shiftId,
        },
      },
    });

    if (exists) {
      return NextResponse.json({ favorite: exists });
    }

    const favorite = await prisma.shiftFavorite.create({
      data: {
        userId: principal.userId,
        shiftId,
      },
      include: { shift: true },
    });

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const shiftId = request.nextUrl.searchParams.get("shiftId");

    if (!shiftId) {
      throw AppError.validation("Shift ID required");
    }

    await prisma.shiftFavorite.delete({
      where: {
        userId_shiftId: {
          userId: principal.userId,
          shiftId,
        },
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
