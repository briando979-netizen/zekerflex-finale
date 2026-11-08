import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const reservatieSchema = z.object({
  naam: z.string().min(1),
  email: z.string().email(),
  telefoon: z.string().min(6),
  persoonen: z.number().positive(),
  datum: z.string().datetime(),
  opmerkingen: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const zaak = await prisma.horecaZaak.findFirst({
      where: { tenants: { some: { memberships: { some: { userId: principal.userId } } } } },
    });

    if (!zaak) {
      throw AppError.notFound("Horeca zaak not found");
    }

    const status = request.nextUrl.searchParams.get("status") || "GEACCEPTEERD";
    const reservaties = await prisma.horecaReservatie.findMany({
      where: { zaakId: zaak.id, status },
      orderBy: { datum: "asc" },
      take: 50,
    });

    return NextResponse.json({ reservaties });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const zaak = await prisma.horecaZaak.findFirst({
      where: { tenants: { some: { memberships: { some: { userId: principal.userId } } } } },
    });

    if (!zaak) {
      throw AppError.notFound("Horeca zaak not found");
    }

    const body = await request.json();
    const reservatie = reservatieSchema.parse(body);

    const created = await prisma.horecaReservatie.create({
      data: {
        ...reservatie,
        zaakId: zaak.id,
        status: "GEACCEPTEERD",
        datum: new Date(reservatie.datum),
      },
    });

    return NextResponse.json({ reservatie: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const reservatieId = request.nextUrl.searchParams.get("id");

    if (!reservatieId) {
      throw AppError.validation("Reservatie ID required");
    }

    const body = await request.json();
    const { status } = z.object({ status: z.enum(["GEACCEPTEERD", "AFGEWEZEN", "GEANNULEERD"]) }).parse(body);

    const updated = await prisma.horecaReservatie.update({
      where: { id: reservatieId },
      data: { status },
    });

    return NextResponse.json({ reservatie: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
