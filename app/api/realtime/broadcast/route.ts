import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { notify } from "@/lib/realtime/notifications";
import { recordActivity } from "@/lib/realtime/activity";
import { recordMatch } from "@/lib/realtime/matching";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requirePrincipal();

    const body = await req.json();
    const { type, userId, event } = body;

    switch (type) {
      case "notification":
        notify(userId, event);
        break;

      case "activity":
        recordActivity(userId, {
          type: event.type,
          title: event.title,
          description: event.description,
          metadata: event.metadata || {},
          visibility: event.visibility || "private",
        });
        break;

      case "match":
        recordMatch({
          workerId: event.workerId,
          employerId: event.employerId,
          jobId: event.jobId,
          status: event.status,
        });
        break;

      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Broadcast error:", err);
    return NextResponse.json({ error: "Broadcast failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    supported: ["notification", "activity", "match"],
  });
}
