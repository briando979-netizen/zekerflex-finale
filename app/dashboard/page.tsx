import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { ReliabilityRing } from "@/components/app/ReliabilityRing";
import { ShiftCard } from "@/components/app/ShiftCard";
import { ApplyButton } from "@/components/app/ApplyButton";
import { RecentMessagesPanel } from "@/components/app/RecentMessagesPanel";
import { WelcomeDialog } from "@/components/app/WelcomeDialog";
import { recentThreads } from "@/lib/messaging/recent";
import {
  PageHeader,
  KpiCard,
  Panel,
  EmptyState,
  StatusPill,
  money,
  moneyExact,
  dateTime,
  dateShort,
} from "@/components/app/ui";

export const dynamic = "force-dynamic";

const PAYOUT_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  SETTLED: "ok",
  PAID: "ok",
  SUBMITTED: "warn",
  PENDING: "warn",
  ISSUED: "warn",
  FAILED: "crit",
  RETURNED: "crit",
};

export default async function DashboardOverviewPage() {
  const principal = await requirePrincipal();
  const [o, market, threads] = await Promise.all([
    getFreelancerOverview(principal.userId),
    getMarketplace(principal.userId),
    recentThreads(principal.userId, false, 4),
  ]);
  const topKlussen = market.shifts.slice(0, 3);
  const payoutSeries = [...o.payouts]
    .reverse()
    .map((p) => p.totalCents / 100)
    .slice(-8);

  return (
    <>
      <WelcomeDialog firstName={principal.fullName.split(" ")[0] || "daar"} />
      <PageHeader
        title={`Hoi, ${principal.fullName.split(" ")[0]}`}
        subtitle="Je overzicht van diensten, uitbetalingen en compliance."
        action={
          <Link href="/dashboard/klussen" className="btn-primary">
            Klussen bekijken
          </Link>
        }
      />

      {!o.profileComplete && (
        <div className="mb-8 card border-warn/30 bg-warn/5 p-5">
          <h2 className="text-sm font-semibold text-ink">Rond je profiel af</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            Je kunt pas diensten aannemen als deze stappen klaar zijn.
          </p>
          <ul className="mt-4 space-y-2">
            {o.onboarding.map((step) => (
              <li key={step.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                    step.done ? "bg-ok text-white" : "border border-hairstrong text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={step.done ? "text-neutralx-500 line-through" : "text-ink"}>
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/verificatie" className="btn-primary mt-4">
            Nu afronden →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Aankomende diensten"
          value={String(o.kpis.upcoming)}
          tone="brand"
          hint={o.kpis.upcoming > 0 ? "gepland" : "geen gepland"}
        />
        <KpiCard
          label="Actie nodig"
          value={String(o.kpis.actionNeeded)}
          hint="urenbriefjes of disputen"
          tone={o.kpis.actionNeeded > 0 ? "warn" : "default"}
        />
        <KpiCard
          label="Verdiend deze maand"
          value={money(o.kpis.earnedThisMonthCents)}
          hint="uitbetaald via SEPA"
          {...(payoutSeries.length > 1 ? { spark: payoutSeries } : {})}
        />
        <KpiCard
          label="Openstaand"
          value={money(o.kpis.pendingPayoutCents)}
          hint="wordt automatisch overgemaakt"
          tone={o.kpis.pendingPayoutCents > 0 ? "brand" : "default"}
        />
      </div>

      {topKlussen.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="eyebrow">Voor jou geselecteerd</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">Klussen die bij je passen</h2>
            </div>
            <Link href="/dashboard/klussen" className="text-sm font-medium text-brand-600 hover:underline">
              Alle klussen →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {topKlussen.map((k) => (
              <ShiftCard
                key={k.id}
                shift={k}
                href={`/dashboard/klussen/${k.id}`}
                action={<ApplyButton shiftId={k.id} disabled={!market.canApply} />}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Aankomende diensten"
          action={
            <Link href="/dashboard/diensten" className="text-xs font-medium text-brand-600">
              Alles
            </Link>
          }
        >
          {o.upcoming.length === 0 ? (
            <EmptyState
              title="Nog geen diensten gepland"
              body="Zodra je een dienst accepteert die bij je past, verschijnt hij hier."
            />
          ) : (
            <ul className="divide-y divide-hair">
              {o.upcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{s.title}</p>
                    <p className="text-xs text-neutralx-500">
                      {s.branch} · {s.city} · {dateTime(s.startsAt)}
                    </p>
                  </div>
                  <span className="num flex-shrink-0 font-mono text-sm text-neutralx-600">
                    {moneyExact(s.hourlyRateCents)}/u
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Jouw betrouwbaarheid">
            <div className="px-5 py-4">
              <ReliabilityRing score={o.reliabilityScore} shiftsCompleted={o.shiftsCompleted} />
              <div className="mt-3 flex items-center gap-2 border-t border-hair pt-3 text-sm">
                <span className="text-neutralx-500">Badge</span>
                <StatusPill tone="neutral">{o.badgeLevel}</StatusPill>
              </div>
            </div>
          </Panel>

          {threads.length > 0 && (
            <Panel
              title="Berichten"
              action={
                <Link href="/dashboard/berichten" className="text-xs font-medium text-brand-600">
                  Alles
                </Link>
              }
            >
              <RecentMessagesPanel threads={threads} allHref="/dashboard/berichten" />
            </Panel>
          )}

          <Panel title="Modelovereenkomsten">
            {o.agreements.length === 0 ? (
              <EmptyState
                title="Nog geen overeenkomsten"
                body="Bij je eerste opdracht wordt automatisch een modelovereenkomst klaargezet."
              />
            ) : (
              <ul className="divide-y divide-hair">
                {o.agreements.map((a) => (
                  <li key={a.reference} className="flex items-center justify-between gap-3 px-5 py-3">
                    <a
                      href={`/api/model-agreements/${a.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="truncate text-sm text-ink">{a.clientLegalName}</p>
                      <p className="font-mono text-xs text-neutralx-400">{a.reference} · pdf openen</p>
                    </a>
                    <StatusPill tone={a.status === "ACTIVE" ? "ok" : "warn"}>
                      {a.status === "ACTIVE" ? "Actief" : "Te tekenen"}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <Panel
          title="Recente uitbetalingen"
          action={
            <Link href="/dashboard/uitbetalingen" className="text-xs font-medium text-brand-600">
              Alles
            </Link>
          }
        >
          {o.payouts.length === 0 ? (
            <EmptyState
              title="Nog geen uitbetalingen"
              body="Na je eerste goedgekeurde dienst zie je hier je uitbetalingen — met de snelheid die je zelf kiest."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Factuur</th>
                  <th className="px-5 py-2.5 font-medium">Datum</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{p.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {dateShort(p.settledAt ?? p.createdAt)}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(p.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={PAYOUT_TONE[p.status] ?? "neutral"}>
                        {p.status === "SETTLED" ? "Uitbetaald" : p.status === "PENDING" ? "In behandeling" : p.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

