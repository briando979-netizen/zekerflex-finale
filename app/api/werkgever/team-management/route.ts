import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
      include: {
        employees: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
      },
      members: company.employees.map((emp) => ({
        id: emp.id,
        name: emp.user?.name,
        email: emp.user?.email,
        role: emp.role,
        joinedAt: emp.createdAt,
      })),
      total: company.employees.length,
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
    const { email, role } = body as { email: string; role: "ADMIN" | "MANAGER" | "VIEWER" };

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw AppError.notFound("User not found");
    }

    // Add to company
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: company.id,
        role,
      },
    });

    return NextResponse.json({
      message: "Team member added",
      membership,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { memberId, role } = body as { memberId: string; role: string };

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    const updated = await prisma.membership.update({
      where: {
        userId_tenantId_role: {
          userId: memberId,
          tenantId: company.id,
          role: "ADMIN", // placeholder
        },
      },
      data: { role },
    });

    return NextResponse.json({
      message: "Team member updated",
      membership: updated,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
