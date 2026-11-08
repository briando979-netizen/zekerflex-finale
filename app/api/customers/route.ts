import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const customerSchema = z.object({
  naam: z.string().min(2),
  email: z.string().email(),
  telefoon: z.string().optional(),
  adres: z.string().optional(),
  stad: z.string().optional(),
  opmerkingen: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const body = await request.json();
    const data = customerSchema.parse(body);

    const customer = await prisma.customer.create({
      data: {
        ...data,
        tenantId: tenant.id,
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const customers = await prisma.customer.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const stats = await Promise.all(
      customers.map(async (c) => {
        const bookings = await prisma.booking.count({
          where: { klantEmail: c.email },
        });

        const totalSpent = await prisma.booking.aggregate({
          where: { klantEmail: c.email },
          _sum: { bedragCent: true },
        });

        return {
          ...c,
          bookings,
          totalSpent: Math.round((totalSpent._sum.bedragCent || 0) / 100),
        };
      }),
    );

    return NextResponse.json({ customers: stats });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const customerId = request.nextUrl.searchParams.get("customerId");

    if (!customerId) {
      throw AppError.validation("Customer ID required");
    }

    const body = await request.json();
    const updates = customerSchema.partial().parse(body);

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: updates,
    });

    return NextResponse.json({ customer: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
