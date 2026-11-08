import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const verificationSchema = z.object({
  type: z.enum(["IDENTITY", "BACKGROUND", "REFERENCE", "QUALIFICATIONS"]),
  status: z.enum(["PENDING", "VERIFIED", "FAILED", "EXPIRED"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const verifications = await prisma.verification.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
    });

    const stats = {
      verified: verifications.filter((v) => v.status === "VERIFIED").length,
      pending: verifications.filter((v) => v.status === "PENDING").length,
      failed: verifications.filter((v) => v.status === "FAILED").length,
    };

    return NextResponse.json({
      verifications: verifications.map((v) => ({
        id: v.id,
        type: v.type,
        status: v.status,
        completedAt: v.completedAt,
        expiresAt: v.expiresAt,
        notes: v.notes,
      })),
      stats,
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
    const { type } = verificationSchema.parse(body);

    const existing = await prisma.verification.findFirst({
      where: { userId: principal.userId, type },
    });

    if (existing && existing.status === "VERIFIED") {
      return NextResponse.json({ verification: existing });
    }

    const verification = await prisma.verification.create({
      data: {
        userId: principal.userId,
        type,
        status: "PENDING",
      },
    });

    return NextResponse.json({ verification }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const verificationId = request.nextUrl.searchParams.get("id");

    if (!verificationId) {
      throw AppError.validation("Verification ID required");
    }

    const body = await request.json();
    const { status, notes } = z
      .object({
        status: z.enum(["VERIFIED", "FAILED", "EXPIRED"]),
        notes: z.string().optional(),
      })
      .parse(body);

    const updated = await prisma.verification.update({
      where: { id: verificationId },
      data: {
        status,
        notes,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ verification: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
