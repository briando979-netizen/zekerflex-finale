import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import * as calendarManager from "@/lib/calendar/manager";
import * as scheduling from "@/lib/scheduling/engine";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  calendarId: z.string(),
  title: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const calendarId = request.nextUrl.searchParams.get("calendarId");
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");

    if (!calendarId || !startDate || !endDate) {
      throw AppError.validation(
        "calendarId, startDate, endDate required"
      );
    }

    const events = await calendarManager.getEvents(
      calendarId,
      new Date(startDate),
      new Date(endDate)
    );

    return NextResponse.json({ events });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = eventSchema.parse(body);

    const hasConflict = await calendarManager.checkDoubleBooking(
      data.calendarId,
      new Date(data.startTime),
      new Date(data.endTime)
    );

    if (hasConflict) {
      throw AppError.validation("Time slot already booked");
    }

    const event = await calendarManager.createEvent(data.calendarId, {
      title: data.title,
      description: data.description,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
