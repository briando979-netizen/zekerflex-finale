import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const maand = request.nextUrl.searchParams.get("maand");
    const jaar = request.nextUrl.searchParams.get("jaar");

    if (!maand || !jaar) {
      throw AppError.validation("Maand en jaar required");
    }

    const maandStart = new Date(parseInt(jaar), parseInt(maand) - 1, 1);
    const maandEinde = new Date(parseInt(jaar), parseInt(maand), 1);

    const events = await Promise.all([
      prisma.booking.findMany({
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: maandStart, lt: maandEinde },
        },
      }),
      prisma.shiftAssignment.findMany({
        where: {
          shift: { companyId: tenant.id },
          shift: { startsAt: { gte: maandStart, lt: maandEinde } },
        },
        include: { shift: true },
      }),
    ]);

    const calendarEvents = [
      ...events[0].map((b) => ({
        id: b.id,
        titel: b.klantNaam,
        datum: b.datumTijd,
        type: "booking",
        bedrag: (b.bedragCent || 0) / 100,
      })),
      ...events[1].map((s) => ({
        id: s.id,
        titel: s.shift.title || "Shift",
        datum: s.shift.startsAt,
        type: "shift",
        rate: s.shift.hourlyRate,
      })),
    ];

    return NextResponse.json({
      events: calendarEvents.sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime()),
      maand: parseInt(maand),
      jaar: parseInt(jaar),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
