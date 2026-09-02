import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { PageHeader, StatusPill } from "@/components/app/ui";
import { MarketplaceView } from "@/components/app/MarketplaceView";

export const dynamic = "force-dynamic";

export default async function KlussenPage() {
  const principal = await requirePrincipal();
  const m = await getMarketplace(principal.userId);

  return (
    <>
      <PageHeader
        title="Klussen"
        subtitle="Open diensten die bij je passen. Filter, bekijk op de kaart, en neem er een aan."
        action={
          m.newSinceLastVisit > 0 ? (
            <StatusPill tone="ok">{m.newSinceLastVisit} nieuw sinds je laatste bezoek</StatusPill>
          ) : undefined
        }
      />

      {!m.canApply && m.blockReason && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          <span>{m.blockReason}</span>
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
          canApply={m.canApply}
          defaultMinRateCents={m.prefs.minHourlyRateCents}
          defaultMaxTravel={m.prefs.maxTravelMinutes}
        />
      )}
    </>
  );
}
