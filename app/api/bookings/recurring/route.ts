import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const {
      productId,
      quantity,
      klantNaam,
      klantEmail,
      startDate,
      frequency,
      endDate,
    } = body;

    const recurring = await prisma.recurringBooking.create({
      data: {
        productId,
        quantity,
        klantNaam,
        klantEmail,
        startDate: new Date(startDate),
        frequency,
        endDate: new Date(endDate),
        status: "ACTIVE",
        nextOccurrence: new Date(startDate),
      },
    });

    return NextResponse.json({ recurring }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const recurring = await prisma.recurringBooking.findMany({
      where: { status: "ACTIVE" },
      take: 50,
    });

    return NextResponse.json({ recurring });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
