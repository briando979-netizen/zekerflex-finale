import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const profielSchema = z.object({
  naam: z.string().min(1).optional(),
  beschrijving: z.string().optional(),
  website: z.string().url().optional(),
  telefoon: z.string().optional(),
  straat: z.string().optional(),
  huisnummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  email: z.string().email().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
      include: {
        companyRegistration: true,
        rijschool: true,
        horecaZaak: true,
      },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    return NextResponse.json({
      profiel: {
        id: tenant.id,
        naam: tenant.naam,
        beschrijving: tenant.beschrijving,
        website: tenant.website,
        telefoon: tenant.telefoon,
        email: tenant.email,
        straat: tenant.straat,
        huisnummer: tenant.huisnummer,
        postcode: tenant.postcode,
        plaats: tenant.plaats,
        registration: tenant.companyRegistration,
        type: tenant.rijschool ? "rijschool" : tenant.horecaZaak ? "horeca" : "generic",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenant = await prisma.tenant.findFirst({
      where: {
        memberships: { some: { userId: principal.userId, role: { in: ["ADMIN", "MANAGER"] } } },
      },
    });

    if (!tenant) {
      throw AppError.forbidden("Only managers can update profile");
    }

    const body = await request.json();
    const updates = profielSchema.parse(body);

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: updates,
      include: {
        companyRegistration: true,
        rijschool: true,
        horecaZaak: true,
      },
    });

    return NextResponse.json({
      profiel: {
        id: updated.id,
        naam: updated.naam,
        beschrijving: updated.beschrijving,
        website: updated.website,
        telefoon: updated.telefoon,
        email: updated.email,
        straat: updated.straat,
        huisnummer: updated.huisnummer,
        postcode: updated.postcode,
        plaats: updated.plaats,
        registration: updated.companyRegistration,
        type: updated.rijschool ? "rijschool" : updated.horecaZaak ? "horeca" : "generic",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
