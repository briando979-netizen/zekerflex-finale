import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const relationshipSchema = z.object({
  targetId: z.string(),
  type: z.enum(["FAVORITE", "BLOCKED", "PREFERRED"]),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type");

    const relationships = await prisma.userRelationship.findMany({
      where: {
        userId: principal.userId,
        ...(type && { type }),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      relationships: relationships.map((r) => ({
        id: r.id,
        targetId: r.targetId,
        type: r.type,
        notes: r.notes,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = relationshipSchema.parse(body);

    if (data.targetId === principal.userId) {
      throw AppError.validation("Cannot add relationship with yourself");
    }

    const existing = await prisma.userRelationship.findUnique({
      where: {
        userId_targetId_type: {
          userId: principal.userId,
          targetId: data.targetId,
          type: data.type,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ relationship: existing });
    }

    const relationship = await prisma.userRelationship.create({
      data: {
        userId: principal.userId,
        targetId: data.targetId,
        type: data.type,
        notes: data.notes,
      },
    });

    return NextResponse.json({ relationship }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const relationshipId = request.nextUrl.searchParams.get("id");

    if (!relationshipId) {
      throw AppError.validation("Relationship ID required");
    }

    await prisma.userRelationship.delete({
      where: { id: relationshipId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
