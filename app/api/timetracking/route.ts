import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { recordTime, getUserTimesheet, getBillableHours } from "@/lib/timetracking/tracker";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RecordTimeSchema = z.object({
  date: z.string().datetime(),
  hours: z.number().positive(),
  description: z.string(),
  taskId: z.string().optional(),
  billable: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = RecordTimeSchema.parse(body);

    const entry = await recordTime({
      userId: principal.userId,
      date: data.date,
      hours: data.hours,
      description: data.description,
      taskId: data.taskId,
      billable: data.billable,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");

    if (!startDate || !endDate) {
      throw AppError.validation("startDate and endDate required");
    }

    const entries = await getUserTimesheet(principal.userId, new Date(startDate), new Date(endDate));
    const billableHours = await getBillableHours(
      principal.userId,
      new Date(startDate),
      new Date(endDate)
    );

    return NextResponse.json({ entries, billableHours });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
