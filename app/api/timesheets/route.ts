import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const timesheetSchema = z.object({
  shiftAssignmentId: z.string(),
  hoursWorked: z.number().positive(),
  breakMinutes: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = timesheetSchema.parse(body);

    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id: data.shiftAssignmentId },
      include: { shift: true },
    });

    if (!assignment) {
      throw AppError.notFound("Shift assignment not found");
    }

    if (assignment.freelancerId !== principal.userId) {
      throw AppError.forbidden("Can only submit your own timesheet");
    }

    const timesheet = await prisma.timesheet.create({
      data: {
        shiftAssignmentId: data.shiftAssignmentId,
        hoursWorked: data.hoursWorked,
        breakMinutes: data.breakMinutes || 0,
        notes: data.notes,
        status: "PENDING",
        submittedBy: principal.userId,
        submittedAt: new Date(),
      },
    });

    return NextResponse.json({ timesheet }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const status = request.nextUrl.searchParams.get("status");

    const timesheets = await prisma.timesheet.findMany({
      where: {
        OR: [
          { submittedBy: principal.userId },
          { shiftAssignment: { shift: { companyId: principal.userId } } },
        ],
        ...(status && { status }),
      },
      include: { shiftAssignment: { include: { shift: true } } },
      orderBy: { submittedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      timesheets: timesheets.map((ts) => ({
        id: ts.id,
        hoursWorked: ts.hoursWorked,
        status: ts.status,
        submittedAt: ts.submittedAt,
        approvedAt: ts.approvedAt,
        earnedAmount: ts.earnedCents ? Math.round(ts.earnedCents / 100) : 0,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const timesheetId = request.nextUrl.searchParams.get("id");

    if (!timesheetId) {
      throw AppError.validation("Timesheet ID required");
    }

    const body = await request.json();
    const { status, approvalNotes } = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
        approvalNotes: z.string().optional(),
      })
      .parse(body);

    const updated = await prisma.timesheet.update({
      where: { id: timesheetId },
      data: {
        status,
        approvedAt: status === "APPROVED" ? new Date() : null,
        approvalNotes: approvalNotes,
      },
    });

    return NextResponse.json({ timesheet: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
