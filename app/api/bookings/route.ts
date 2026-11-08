import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  datumTijd: z.string().datetime(),
  klantNaam: z.string().min(2),
  klantEmail: z.string().email(),
  klantTelefoon: z.string().optional(),
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
    const data = bookingSchema.parse(body);

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    });

    if (!product) {
      throw AppError.notFound("Product not found");
    }

    const bedrag = (product.prijsCent || 0) * data.quantity;

    const booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        productId: data.productId,
        quantity: data.quantity,
        datumTijd: new Date(data.datumTijd),
        klantNaam: data.klantNaam,
        klantEmail: data.klantEmail,
        klantTelefoon: data.klantTelefoon,
        opmerkingen: data.opmerkingen,
        bedragCent: bedrag,
        status: "PENDING",
      },
    });

    return NextResponse.json({ booking }, { status: 201 });
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

    const status = request.nextUrl.searchParams.get("status");

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        ...(status && { status }),
      },
      orderBy: { datumTijd: "desc" },
      take: 100,
    });

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        klantNaam: b.klantNaam,
        klantEmail: b.klantEmail,
        datum: b.datumTijd,
        quantity: b.quantity,
        bedrag: Math.round((b.bedragCent || 0) / 100),
        status: b.status,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const bookingId = request.nextUrl.searchParams.get("bookingId");

    if (!bookingId) {
      throw AppError.validation("Booking ID required");
    }

    const body = await request.json();
    const { status } = z.object({ status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]) }).parse(body);

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });

    return NextResponse.json({ booking: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
