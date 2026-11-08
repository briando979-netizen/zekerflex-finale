import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import * as smartScheduling from "@/lib/scheduling/smart";
import * as scheduling from "@/lib/scheduling/engine";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const smartScheduleSchema = z.object({
  attendees: z.array(z.string()),
  duration: z.number().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  timezone: z.string().optional(),
  location: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = smartScheduleSchema.parse(body);

    const suggestion = await smartScheduling.smartScheduleMeeting({
      ...data,
      attendees: data.attendees.filter((a) => a !== principal.userId),
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type") || "availability";

    if (type === "availability") {
      const startDate = new Date(request.nextUrl.searchParams.get("start") || new Date());
      const endDate = new Date(
        request.nextUrl.searchParams.get("end") ||
          new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      );
      const duration = parseInt(
        request.nextUrl.searchParams.get("duration") || "60"
      );

      const availability = await scheduling.findAvailability(
        principal.userId,
        startDate,
        endDate,
        duration
      );

      return NextResponse.json({ availability });
    }

    return NextResponse.json(
      { error: "Unknown type" },
      { status: 400 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
