import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const taskSchema = z.object({
  titel: z.string().min(3),
  beschrijving: z.string().optional(),
  prioriteit: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().optional(),
  assignee: z.string().optional(),
  categorie: z.string().optional(),
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
    const data = taskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        ...data,
        tenantId: tenant.id,
        createdBy: principal.userId,
        status: "OPEN",
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    return NextResponse.json({ task }, { status: 201 });
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

    const status = request.nextUrl.searchParams.get("status") || "OPEN";

    const tasks = await prisma.task.findMany({
      where: {
        tenantId: tenant.id,
        status,
      },
      orderBy: { dueDate: "asc" },
      take: 100,
    });

    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        titel: t.titel,
        beschrijving: t.beschrijving,
        status: t.status,
        prioriteit: t.prioriteit,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const taskId = request.nextUrl.searchParams.get("taskId");

    if (!taskId) {
      throw AppError.validation("Task ID required");
    }

    const body = await request.json();
    const { status, prioriteit, beschrijving } = z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
        prioriteit: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        beschrijving: z.string().optional(),
      })
      .parse(body);

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        prioriteit,
        beschrijving,
      },
    });

    return NextResponse.json({ task: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
