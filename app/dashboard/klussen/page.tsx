import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { StatusPill } from "@/components/app/ui";
import { MarketplaceView } from "@/components/app/MarketplaceView";

export const dynamic = "force-dynamic";

export default async function KlussenPage({
  searchParams,
}: {
  searchParams: { employer?: string };
}) {
  const principal = await requirePrincipal();
  const m = await getMarketplace(principal.userId);
  const initialQuery = typeof searchParams.employer === "string" ? searchParams.employer : "";

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
            Vind jouw klus
          </h1>
          <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        </div>
        {m.newSinceLastVisit > 0 && (
          <StatusPill tone="ok">{m.newSinceLastVisit} nieuw</StatusPill>
        )}
      </div>

      {!m.canApply && m.blockReason && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          <span>
            Je kunt alvast rondkijken. {m.blockReason} Reageren op een klus kan zodra dat rond is.
          </span>
          {/verificatie|geverifieerd/i.test(m.blockReason) && (
            <Link href="/dashboard/verificatie" className="btn-primary">
              Naar verificatie
            </Link>
          )}
        </div>
      )}

      {m.shifts.length === 0 ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">Momenteel geen open klussen</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">
              Stel een job-alert in bij <Link href="/dashboard/beschikbaarheid" className="text-brand-600 underline">Beschikbaarheid</Link> —
              dan krijg je een melding zodra er een passende dienst is.
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
