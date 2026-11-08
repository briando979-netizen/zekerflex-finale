import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const documentSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["CONTRACT", "POLICY", "GUIDE", "FORM", "OTHER"]),
  url: z.string().url(),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  required: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const companyId = request.nextUrl.searchParams.get("companyId");
    const type = request.nextUrl.searchParams.get("type");

    let where: any = {};

    if (companyId) {
      where.companyId = companyId;
    } else {
      where.createdBy = principal.userId;
    }

    if (type) {
      where.type = type;
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        url: d.url,
        description: d.description,
        expiresAt: d.expiresAt,
        required: d.required,
        createdAt: d.createdAt,
        version: d.version,
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
    const data = documentSchema.parse(body);

    const document = await prisma.document.create({
      data: {
        ...data,
        createdBy: principal.userId,
        version: 1,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const documentId = request.nextUrl.searchParams.get("id");

    if (!documentId) {
      throw AppError.validation("Document ID required");
    }

    const body = await request.json();
    const updates = documentSchema.partial().parse(body);

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw AppError.notFound("Document not found");
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        ...updates,
        version: (doc.version || 1) + 1,
        expiresAt: updates.expiresAt ? new Date(updates.expiresAt) : doc.expiresAt,
      },
    });

    return NextResponse.json({ document: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const documentId = request.nextUrl.searchParams.get("id");

    if (!documentId) {
      throw AppError.validation("Document ID required");
    }

    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
