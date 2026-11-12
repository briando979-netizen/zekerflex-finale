import { withUsage } from "@/lib/ops/usage";
import { after, NextResponse } from "next/server";
import { maybeSweepWorkerPushes } from "@/lib/notifications/worker-push";
import { maybeRunMatchingFollowups } from "@/lib/matching/sweep";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getNotifications } from "@/lib/notifications/feed";
import { hasRole } from "@/lib/auth";
import { userLocale } from "@/lib/i18n/worker-locale";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { MELDING_NL } from "@/lib/notifications/feed-teksten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    // piggyback: the throttled werknemer-push sweep (reminders, uitgekozen, …)
    after(() => maybeSweepWorkerPushes());
    after(() => maybeRunMatchingFollowups());
    // een werker leest de vaste zinnen in zijn app-taal (vertaald bij het lezen, dus ook bestaande meldingen);
    // een opdrachtgever en beheer blijven Nederlands
    const teksten = hasRole(p, "FREELANCER") ? FREELANCER_DICTS[await userLocale(p.userId)].meldingTeksten : MELDING_NL;
    const items = await getNotifications(p, teksten);
    return NextResponse.json({ items, count: items.length, urgent: items.filter((i) => i.urgent).length });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const GET = withUsage("meldingen (polling)", handleGET);
