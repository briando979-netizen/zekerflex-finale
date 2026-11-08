import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const productSchema = z.object({
  naam: z.string().min(1),
  beschrijving: z.string().optional(),
  prijs: z.number().positive(),
  afbeelding: z.string().url().optional(),
  categorie: z.string(),
  voorraad: z.number().nonnegative().optional(),
  zichtbaar: z.boolean().optional(),
  kenmerken: z.record(z.any()).optional(),
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
    const data = productSchema.parse(body);

    const product = await prisma.product.create({
      data: {
        ...data,
        tenantId: tenant.id,
        prijsCent: Math.round(data.prijs * 100),
        kenmerkenJson: data.kenmerken ? JSON.stringify(data.kenmerken) : null,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
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

    const categorie = request.nextUrl.searchParams.get("categorie");

    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        zichtbaar: true,
        ...(categorie && { categorie }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      products: products.map((p) => ({
        id: p.id,
        naam: p.naam,
        beschrijving: p.beschrijving,
        prijs: p.prijsCent ? p.prijsCent / 100 : 0,
        categorie: p.categorie,
        voorraad: p.voorraad,
        afbeelding: p.afbeelding,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const productId = request.nextUrl.searchParams.get("productId");

    if (!productId) {
      throw AppError.validation("Product ID required");
    }

    const body = await request.json();
    const updates = productSchema.partial().parse(body);

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...updates,
        prijsCent: updates.prijs ? Math.round(updates.prijs * 100) : undefined,
        kenmerkenJson: updates.kenmerken ? JSON.stringify(updates.kenmerken) : undefined,
      },
    });

    return NextResponse.json({ product: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
