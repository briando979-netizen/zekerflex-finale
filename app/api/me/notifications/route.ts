import { withUsage } from "@/lib/ops/usage";
import { after, NextResponse } from "next/server";
import { maybeSweepWorkerPushes } from "@/lib/notifications/worker-push";
import { maybeRunMatchingFollowups } from "@/lib/matching/sweep";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getNotifications } from "@/lib/notifications/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    // piggyback: the throttled werknemer-push sweep (reminders, uitgekozen, …)
    after(() => maybeSweepWorkerPushes());
    after(() => maybeRunMatchingFollowups());
    const items = await getNotifications(p);
    return NextResponse.json({ items, count: items.length, urgent: items.filter((i) => i.urgent).length });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const GET = withUsage("meldingen (polling)", handleGET);
