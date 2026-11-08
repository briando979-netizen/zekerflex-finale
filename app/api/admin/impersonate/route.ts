import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    await requireRole("PLATFORM_ADMIN");

    const { userId } = await request.json();

    if (!userId) {
      throw AppError.validation("User ID required");
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      throw AppError.notFound("User not found");
    }

    await prisma.auditLog.create({
      data: {
        userId: principal.userId,
        action: "IMPERSONATE_START",
        resource: "USER",
        resourceId: userId,
        changes: JSON.stringify({ targetUser: targetUser.email }),
        timestamp: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") || "",
        userAgent: request.headers.get("user-agent") || "",
      },
    });

    return NextResponse.json({
      impersonationToken: Buffer.from(`${principal.userId}:${userId}`).toString("base64"),
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    await requireRole("PLATFORM_ADMIN");

    const { targetUserId } = await request.json();

    await prisma.auditLog.create({
      data: {
        userId: principal.userId,
        action: "IMPERSONATE_END",
        resource: "USER",
        resourceId: targetUserId,
        timestamp: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") || "",
        userAgent: request.headers.get("user-agent") || "",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
