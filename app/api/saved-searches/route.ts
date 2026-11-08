import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const savedSearchSchema = z.object({
  name: z.string().min(1),
  criteria: z.record(z.any()),
  alerts: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const searches = await prisma.savedSearch.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      searches: searches.map((s) => ({
        id: s.id,
        name: s.name,
        criteria: s.criteria ? JSON.parse(s.criteria as string) : {},
        alerts: s.alerts,
        matchCount: 0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
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
    const data = savedSearchSchema.parse(body);

    const search = await prisma.savedSearch.create({
      data: {
        userId: principal.userId,
        name: data.name,
        criteria: JSON.stringify(data.criteria),
        alerts: data.alerts || false,
      },
    });

    return NextResponse.json(
      {
        search: {
          id: search.id,
          name: search.name,
          criteria: search.criteria ? JSON.parse(search.criteria as string) : {},
          alerts: search.alerts,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const searchId = request.nextUrl.searchParams.get("id");

    if (!searchId) {
      throw AppError.validation("Search ID required");
    }

    const body = await request.json();
    const updates = savedSearchSchema.partial().parse(body);

    const updated = await prisma.savedSearch.update({
      where: { id: searchId },
      data: {
        ...updates,
        criteria: updates.criteria ? JSON.stringify(updates.criteria) : undefined,
      },
    });

    return NextResponse.json({
      search: {
        id: updated.id,
        name: updated.name,
        criteria: updated.criteria ? JSON.parse(updated.criteria as string) : {},
        alerts: updated.alerts,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const searchId = request.nextUrl.searchParams.get("id");

    if (!searchId) {
      throw AppError.validation("Search ID required");
    }

    await prisma.savedSearch.delete({
      where: { id: searchId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
