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
import { meldingBedrijfVoor } from "@/lib/notifications/bedrijf-teksten";
import { getLocale } from "@/lib/i18n/server";
import { laadFreelancerDict } from "@/lib/i18n/freelancer-lader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    // piggyback: the throttled werknemer-push sweep (reminders, uitgekozen, …)
    after(() => maybeSweepWorkerPushes());
    after(() => maybeRunMatchingFollowups());
    // ?app=werker|werkgever: de bel van die app toont alleen de meldingen van die kant (lib/notifications/feed.ts, MeldingApp)
    const appParam = new URL(request.url).searchParams.get("app");
    const app = appParam === "werker" || appParam === "werkgever" ? appParam : undefined;
    if (app === "werkgever") {
      // de werkgeversapp is Nederlands of Engels (de taal van de app, niet die van een eventueel werkersaccount)
      const locale = await getLocale();
      const items = await getNotifications(p, locale === "en" ? FREELANCER_DICTS.en.meldingTeksten : MELDING_NL, {
        app,
        bedrijf: meldingBedrijfVoor(locale),
      });
      return NextResponse.json({ items, count: items.length, urgent: items.filter((i) => i.urgent).length });
    }
    // een werker leest de vaste zinnen in zijn app-taal (vertaald bij het lezen, dus ook bestaande meldingen);
    // een opdrachtgever en beheer blijven Nederlands
    const teksten = hasRole(p, "FREELANCER") ? (await laadFreelancerDict(await userLocale(p.userId))).meldingTeksten : MELDING_NL;
    const items = await getNotifications(p, teksten, app ? { app } : {});
    return NextResponse.json({ items, count: items.length, urgent: items.filter((i) => i.urgent).length });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const GET = withUsage("meldingen (polling)", handleGET);
