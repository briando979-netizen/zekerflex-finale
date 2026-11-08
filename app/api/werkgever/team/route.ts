import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    return NextResponse.json({
      members: tenant.memberships.map((m) => ({
        id: m.id,
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        joinedAt: m.createdAt,
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
    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId, role: "ADMIN" } } },
    });

    if (!tenant) {
      throw AppError.forbidden("Only admins can add team members");
    }

    const body = await request.json();
    const { email, role } = memberSchema.parse(body);

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email, name: email.split("@")[0] },
      });
    }

    const membership = await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return NextResponse.json(
      {
        member: {
          id: membership.id,
          userId: membership.user.id,
          email: membership.user.email,
          name: membership.user.name,
          role: membership.role,
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
    const memberId = request.nextUrl.searchParams.get("memberId");

    if (!memberId) {
      throw AppError.validation("Member ID required");
    }

    const body = await request.json();
    const { role } = z.object({ role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) }).parse(body);

    const updated = await prisma.tenantMembership.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return NextResponse.json({
      member: {
        id: updated.id,
        userId: updated.user.id,
        email: updated.user.email,
        name: updated.user.name,
        role: updated.role,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const memberId = request.nextUrl.searchParams.get("memberId");

    if (!memberId) {
      throw AppError.validation("Member ID required");
    }

    await prisma.tenantMembership.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
