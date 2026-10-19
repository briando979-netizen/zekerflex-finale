import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { StatusPill } from "@/components/app/ui";
import { MarketplaceView } from "@/components/app/MarketplaceView";
import { getFreelancerDict } from "@/lib/i18n/server";
import { translateBlockReason } from "@/lib/i18n/freelancer";

export const dynamic = "force-dynamic";

export default async function KlussenPage(
  props: {
    searchParams: Promise<{ employer?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const principal = await requirePrincipal();
  const m = await getMarketplace(principal.userId);
  const t = await getFreelancerDict();
  const initialQuery = typeof searchParams.employer === "string" ? searchParams.employer : "";

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
            {t.nav.findJob}
          </h1>
          <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        </div>
        {m.newSinceLastVisit > 0 && (
          <StatusPill tone="ok">{t.page.newCount(m.newSinceLastVisit)}</StatusPill>
        )}
      </div>

      {!m.canApply && m.blockReason && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          <span>
            {t.page.browseFirst} {translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}
          </span>
          {/verificatie|geverifieerd/i.test(m.blockReason) && (
            <Link href="/dashboard/verificatie" className="btn-primary">
              {t.page.toVerification}
            </Link>
          )}
        </div>
      )}

      {m.shifts.length === 0 ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">{t.page.noJobsTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">
              {t.page.noJobsBefore} <Link href="/dashboard/beschikbaarheid" className="text-brand-600 underline">{t.page.availability}</Link>{" "}
              {t.page.noJobsAfter}
            </p>
          </div>
        </div>
      ) : (
        <MarketplaceView
          shifts={m.shifts}
          home={m.home}
          homeLabel={m.homeLabel}
          initialQuery={initialQuery}
          canApply={m.canApply}
          blockReason={m.blockReason}
          defaultMinRateCents={m.prefs.minHourlyRateCents}
          defaultMaxTravel={m.prefs.maxTravelMinutes}
        />
      )}
    </>
  );
}
