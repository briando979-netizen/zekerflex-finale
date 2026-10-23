import Link from "next/link";
import { WelcomeBack } from "@/components/app/WelcomeBack";
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

  // Warme, contextuele subregel bij de groet — alleen als er iets te melden is.
  const greetSub =
    m.newSinceLastVisit > 0
      ? m.newSinceLastVisit === 1
        ? "Er staat 1 nieuwe klus voor je klaar."
        : `Er staan ${m.newSinceLastVisit} nieuwe klussen voor je klaar.`
      : m.shifts.length > 0
        ? "Ontdek de klussen die bij je passen."
        : undefined;

  return (
    <>
      <WelcomeBack name={principal.fullName} {...(greetSub ? { subtitle: greetSub } : {})} />
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
        <div className={`card mb-6 flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-neutralx-700 ${/verificatie|geverifieerd/i.test(m.blockReason) ? "trust-card" : "border-warn/30 bg-warn/5"}`}>
          <span className="flex items-start gap-3">
            {/verificatie|geverifieerd/i.test(m.blockReason) && (
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-trust text-white shadow-[0_8px_20px_-8px_rgba(124,58,237,0.7)]" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            )}
            <span>
            {t.page.browseFirst} {translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}
            </span>
          </span>
          {/verificatie|geverifieerd/i.test(m.blockReason) && (
            <Link href="/dashboard/verificatie" className="btn-trust">
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
