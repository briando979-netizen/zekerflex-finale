import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const menuItemSchema = z.object({
  naam: z.string().min(1),
  beschrijving: z.string().optional(),
  prijs: z.number().positive(),
  categorie: z.string(),
  beschikbaar: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const zaakId = request.nextUrl.searchParams.get("zaakId");

    if (!zaakId) {
      throw AppError.validation("zaakId required");
    }

    const menu = await prisma.horecaMenuItem.findMany({
      where: { zaakId },
      orderBy: { categorie: "asc" },
    });

    return NextResponse.json({ items: menu });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const zaakId = request.nextUrl.searchParams.get("zaakId");

    if (!zaakId) {
      throw AppError.validation("zaakId required");
    }

    const body = await request.json();
    const item = menuItemSchema.parse(body);

    const created = await prisma.horecaMenuItem.create({
      data: {
        ...item,
        zaakId,
        prijsCent: Math.round(item.prijs * 100),
      },
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const itemId = request.nextUrl.searchParams.get("itemId");

    if (!itemId) {
      throw AppError.validation("itemId required");
    }

    const body = await request.json();
    const updates = menuItemSchema.partial().parse(body);

    const updated = await prisma.horecaMenuItem.update({
      where: { id: itemId },
      data: {
        ...updates,
        ...(updates.prijs && { prijsCent: Math.round(updates.prijs * 100) }),
      },
    });

    return NextResponse.json({ item: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const itemId = request.nextUrl.searchParams.get("itemId");

    if (!itemId) {
      throw AppError.validation("itemId required");
    }

    await prisma.horecaMenuItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
