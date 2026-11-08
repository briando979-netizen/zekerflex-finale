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

    const settings = {
      bedrijf: {
        naam: tenant.naam,
        email: tenant.email,
        telefoon: tenant.telefoon,
        website: tenant.website,
        adres: `${tenant.straat} ${tenant.huisnummer}`,
        postcode: tenant.postcode,
        plaats: tenant.plaats,
      },
      notificaties: {
        emailBijBooking: true,
        smsBijBooking: false,
        herinnering24uur: true,
        herinnering1uur: false,
      },
      betalingen: {
        accepterenStripe: true,
        accepterenPayPal: false,
        accepterenOverboeking: true,
      },
      openingstijden: {
        maandag: "09:00-17:00",
        dinsdag: "09:00-17:00",
        woensdag: "09:00-17:00",
        donderdag: "09:00-17:00",
        vrijdag: "09:00-17:00",
        zaterdag: "10:00-16:00",
        zondag: "Gesloten",
      },
    };

    return NextResponse.json({ settings });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId, role: "ADMIN" } } },
    });

    if (!tenant) {
      throw AppError.forbidden("Only admins can change settings");
    }

    const body = await request.json();
    const { bedrijf } = body;

    if (bedrijf) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          naam: bedrijf.naam || undefined,
          email: bedrijf.email || undefined,
          telefoon: bedrijf.telefoon || undefined,
          website: bedrijf.website || undefined,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
