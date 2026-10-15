import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { getStripeOverview, type MoneyAmount, type StripeOverview } from "@/lib/billing/stripe-overview";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, moneyExact } from "@/components/app/ui";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

const PAYOUT_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "crit" | "neutral" }> = {
  paid: { label: "Op je rekening", tone: "ok" },
  in_transit: { label: "Onderweg", tone: "warn" },
  pending: { label: "In behandeling", tone: "warn" },
  failed: { label: "Mislukt", tone: "crit" },
  canceled: { label: "Geannuleerd", tone: "neutral" },
};

const DISPUTE_REASON: Record<string, string> = {
  fraudulent: "Fraude gemeld",
  duplicate: "Dubbel betaald",
  product_not_received: "Niet ontvangen",
  product_unacceptable: "Niet naar wens",
  subscription_canceled: "Abonnement opgezegd",
  credit_not_processed: "Terugbetaling niet verwerkt",
  general: "Algemeen",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" });

function amount(cents: number, currency: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function sum(list: MoneyAmount[] | undefined): string {
  if (!list || list.length === 0) return "—";
  return list.map((m) => amount(m.amountCents, m.currency)).join(" + ");
}

// Live view of the Stripe account inside ZekerFlex — no need to open Stripe.
export default async function AdminStripePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Geen toegang" subtitle="Het Stripe-overzicht is alleen voor platformbeheerders." />
      </div>
    );
  }

  if (!env.STRIPE_SECRET_KEY) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Stripe live" subtitle="Er is nog geen Stripe-sleutel ingesteld (STRIPE_SECRET_KEY)." />
      </div>
    );
  }

  let o: StripeOverview;
  try {
    o = await getStripeOverview();
  } catch (err) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Stripe live" subtitle="Rechtstreeks uit je Stripe-account." />
        <p className="rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-ink">
          Stripe is nu niet bereikbaar: {(err as Error).message}
        </p>
      </div>
    );
  }

  const openDisputes = o.disputes.filter((d) => d.open);
  const succeeded = o.payments.filter((p) => p.status === "succeeded");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Stripe live"
          subtitle="Saldo, betalingen, uitbetalingen en geschillen — rechtstreeks uit je Stripe-account, zonder Stripe te openen."
        />
        <div className="flex items-center gap-3 pb-1">
          <StatusPill tone={o.livemode ? "ok" : "warn"}>{o.livemode ? "Live-modus" : "Testmodus"}</StatusPill>
          <AutoRefresh fetchedAt={o.fetchedAt} />
        </div>
      </div>

      {o.errors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-ink">
          {o.errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}

      {openDisputes.length > 0 && (
        <div className="rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-ink">
          <p className="font-semibold text-crit">
            {openDisputes.length === 1 ? "1 open geschil" : `${openDisputes.length} open geschillen`} — reageer op tijd, anders
            verlies je het bedrag automatisch.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {openDisputes.map((d) => (
              <li key={d.id}>
                {amount(d.amountCents, d.currency)} · {DISPUTE_REASON[d.reason] ?? d.reason}
                {d.dueBy ? ` · uiterlijk ${day(d.dueBy)}` : ""} ·{" "}
                <a href={d.dashboardUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">
                  bewijs aanleveren in Stripe ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Beschikbaar saldo" value={sum(o.balance?.available)} tone="brand" hint="Klaar om uit te betalen" />
        <KpiCard label="Onderweg" value={sum(o.balance?.pending)} hint="Nog niet vrijgegeven door Stripe" />
        <KpiCard
          label="Omzet 30 dagen"
          value={o.last30 ? moneyExact(o.last30.grossCents) : "—"}
          {...(o.last30
            ? {
                hint: `${o.last30.payments} betaling${o.last30.payments === 1 ? "" : "en"}${
                  o.last30.refundedCents ? ` · ${moneyExact(o.last30.refundedCents)} terugbetaald` : ""
                }`,
              }
            : {})}
        />
        <KpiCard
          label="Stripe-kosten 30 dagen"
          value={o.last30 ? moneyExact(o.last30.feeCents) : "—"}
          {...(o.last30 ? { hint: `Netto ontvangen: ${moneyExact(o.last30.netCents)}` } : {})}
        />
      </div>

      <Panel title={`Recente betalingen (${succeeded.length} geslaagd van ${o.payments.length})`}>
        {o.payments.length === 0 ? (
          <EmptyState title="Nog geen betalingen" body="Zodra er via Stripe betaald wordt, zie je het hier meteen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Moment</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-5 py-2.5 font-medium">Betaalmethode</th>
                  <th className="px-5 py-2.5 font-medium">Betaler</th>
                  <th className="px-5 py-2.5 font-medium">Voor</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-neutralx-500">{when(p.created)}</td>
                    <td className="num whitespace-nowrap px-5 py-3 text-right font-medium">
                      {amount(p.amountCents, p.currency)}
                      {p.refundedCents > 0 && (
                        <span className="block text-xs font-normal text-neutralx-400">−{amount(p.refundedCents, p.currency)} terug</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{p.method}</td>
                    <td className="max-w-[14rem] truncate px-5 py-3 text-neutralx-600">{p.payer ?? "—"}</td>
                    <td className="px-5 py-3">
                      {p.link ? (
                        <a href={p.link.href} className="text-xs font-medium text-brand-600 hover:underline">
                          {p.link.label}
                        </a>
                      ) : (
                        <span className="text-xs text-neutralx-400">{p.description ?? "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <StatusPill tone={p.status === "succeeded" ? "ok" : p.status === "failed" ? "crit" : "warn"}>
                        {p.status === "succeeded" ? "Geslaagd" : p.status === "failed" ? "Mislukt" : "In behandeling"}
                      </StatusPill>
                      <a
                        href={p.dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs text-neutralx-400 hover:text-ink"
                        aria-label="Openen in Stripe"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Uitbetalingen naar je bank">
          {o.payouts.length === 0 ? (
            <EmptyState title="Nog geen uitbetalingen" body="Stripe maakt het saldo automatisch over zodra er genoeg vrijgegeven is." />
          ) : (
            <ul className="divide-y divide-hair text-sm">
              {o.payouts.map((p) => {
                const s = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span>
                      <span className="num font-medium text-ink">{amount(p.amountCents, p.currency)}</span>
                      <span className="block text-xs text-neutralx-500">
                        {day(p.arrivalDate)}
                        {p.destination ? ` · ${p.destination}` : ""}
                      </span>
                    </span>
                    <StatusPill tone={s.tone}>{s.label}</StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Geschillen (chargebacks)">
          {o.disputes.length === 0 ? (
            <EmptyState title="Geen geschillen" body="Mooi zo — niemand heeft een betaling teruggedraaid." />
          ) : (
            <ul className="divide-y divide-hair text-sm">
              {o.disputes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="num font-medium text-ink">{amount(d.amountCents, d.currency)}</span>
                    <span className="block text-xs text-neutralx-500">{DISPUTE_REASON[d.reason] ?? d.reason}</span>
                  </span>
                  <a href={d.dashboardUrl} target="_blank" rel="noopener noreferrer">
                    <StatusPill tone={d.open ? "crit" : d.status === "won" ? "ok" : "neutral"}>
                      {d.open ? "Open" : d.status === "won" ? "Gewonnen" : d.status === "lost" ? "Verloren" : d.status}
                    </StatusPill>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
