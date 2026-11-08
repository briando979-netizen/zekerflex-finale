import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getCalendarEvents, checkAvailability, bookSlot } from "@/lib/realtime/calendar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const startDate = new Date(req.nextUrl.searchParams.get("start") || Date.now());
    const endDate = new Date(req.nextUrl.searchParams.get("end") || Date.now() + 30 * 86400000);

    const events = getCalendarEvents(principal.userId, startDate, endDate);

    return NextResponse.json({
      events,
      period: { start: startDate, end: endDate },
    });
  } catch (err) {
    console.error("Calendar fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await req.json();

    const { startTime, endTime, title, bookedBy } = body;

    if (!startTime || !endTime) {
      return NextResponse.json({ error: "Missing time fields" }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    const available = checkAvailability(principal.userId, start, end);

    if (!available) {
      return NextResponse.json({ error: "Time slot not available" }, { status: 409 });
    }

    const event = bookSlot(principal.userId, bookedBy || "system", title || "Booking", start, end);

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("Calendar booking error:", err);
    return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
  }
}
