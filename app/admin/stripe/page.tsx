import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { getStripeOverview, type MoneyAmount, type StripeOverview } from "@/lib/billing/stripe-overview";
import { euroExact, dateNl, dateTimeNl } from "@/lib/admin/format";
import { Empty, KpiStrip, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

const PAYOUT_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "Op je rekening", tone: "ok" },
  in_transit: { label: "Onderweg", tone: "plan" },
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
    return <PageHead title="Geen toegang" subtitle="Het Stripe-overzicht is alleen voor platformbeheerders." />;
  }
  if (!env.STRIPE_SECRET_KEY) {
    return <PageHead title="Stripe" subtitle="Er is nog geen Stripe-sleutel ingesteld (STRIPE_SECRET_KEY)." />;
  }

  let o: StripeOverview;
  try {
    o = await getStripeOverview();
  } catch (err) {
    return (
      <div className="space-y-4">
        <PageHead title="Stripe" subtitle="Rechtstreeks uit je Stripe-account." />
        <Panel><p className="text-sm" style={{ color: "var(--a-crit)" }}>Stripe is nu niet bereikbaar: {(err as Error).message}</p></Panel>
      </div>
    );
  }

  const openDisputes = o.disputes.filter((d) => d.open);
  const succeeded = o.payments.filter((p) => p.status === "succeeded");

  const paymentRows: TableRow[] = o.payments.map((p) => {
    const status = p.status === "succeeded" ? "Geslaagd" : p.status === "failed" ? "Mislukt" : "In behandeling";
    return {
      id: p.id,
      search: `${p.payer ?? ""} ${p.method} ${p.description ?? ""} ${p.link?.label ?? ""}`,
      filters: { status: p.status },
      cells: {
        when: <span className="whitespace-nowrap">{dateTimeNl(p.created)}</span>,
        amount: (
          <span className="whitespace-nowrap font-medium" style={{ color: "var(--a-text)" }}>
            {amount(p.amountCents, p.currency)}
            {p.refundedCents > 0 && <span className="block text-xs font-normal" style={{ color: "var(--a-mute)" }}>−{amount(p.refundedCents, p.currency)} terug</span>}
          </span>
        ),
        method: p.method,
        payer: <span className="block max-w-[14rem] truncate">{p.payer ?? "—"}</span>,
        purpose: p.link ? <a href={p.link.href} className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>{p.link.label}</a> : <span className="block max-w-[14rem] truncate text-xs">{p.description ?? "—"}</span>,
        status: <Pill tone={p.status === "succeeded" ? "ok" : p.status === "failed" ? "crit" : "warn"}>{status}</Pill>,
        open: <a href={p.dashboardUrl} target="_blank" rel="noopener noreferrer" className="a-button text-xs" aria-label="Openen in Stripe">Stripe ↗</a>,
      },
      sort: { when: new Date(p.created).getTime(), amount: p.amountCents, method: p.method, payer: p.payer ?? "", status },
      csv: { when: p.created, amount: (p.amountCents / 100).toFixed(2), method: p.method, payer: p.payer ?? "", purpose: p.link?.label ?? p.description ?? "", status, open: p.dashboardUrl },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Stripe"
        subtitle="Saldo, betalingen, uitbetalingen en geschillen, rechtstreeks uit je Stripe-account."
        meta={<Pill tone={o.livemode ? "ok" : "warn"}>{o.livemode ? "Live" : "Testmodus"}</Pill>}
        actions={<AutoRefresh fetchedAt={o.fetchedAt} />}
      />

      {o.errors.length > 0 && (
        <Panel>
          <ul className="space-y-1 text-sm" style={{ color: "var(--a-warn)" }}>
            {o.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </Panel>
      )}

      {openDisputes.length > 0 && (
        <Panel
          flush
          title={openDisputes.length === 1 ? "1 open geschil" : `${openDisputes.length} open geschillen`}
          subtitle="Reageer op tijd, anders verlies je het bedrag automatisch."
        >
          <ul>
            {openDisputes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{amount(d.amountCents, d.currency)}</span>
                <span className="min-w-[10rem] flex-1" style={{ color: "var(--a-dim)" }}>{DISPUTE_REASON[d.reason] ?? d.reason}{d.dueBy ? `, uiterlijk ${dateNl(d.dueBy)}` : ""}</span>
                <a href={d.dashboardUrl} target="_blank" rel="noopener noreferrer" className="a-button a-button-primary text-xs">Bewijs aanleveren ↗</a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <KpiStrip
        items={[
          { label: "Beschikbaar", value: sum(o.balance?.available), hint: "klaar om uit te betalen", tone: "money" },
          { label: "Onderweg", value: sum(o.balance?.pending), hint: "nog niet vrijgegeven" },
          ...(o.last30
            ? [
                { label: "Omzet 30 dagen", value: euroExact(o.last30.grossCents), hint: `${o.last30.payments} ${o.last30.payments === 1 ? "betaling" : "betalingen"}${o.last30.refundedCents ? `, ${euroExact(o.last30.refundedCents)} terug` : ""}` },
                { label: "Stripe-kosten 30 dagen", value: euroExact(o.last30.feeCents), hint: `netto ${euroExact(o.last30.netCents)}` },
              ]
            : []),
        ]}
      />

      <Panel flush title="Recente betalingen" subtitle={`${succeeded.length} geslaagd van ${o.payments.length}`}>
        <DataTable
          columns={[
            { key: "when", label: "Moment" },
            { key: "amount", label: "Bedrag", align: "right" },
            { key: "method", label: "Methode", hideOnMobile: true },
            { key: "payer", label: "Betaler", hideOnMobile: true },
            { key: "purpose", label: "Voor", hideOnMobile: true, sortable: false },
            { key: "status", label: "Status" },
            { key: "open", label: "", align: "right", sortable: false },
          ]}
          rows={paymentRows}
          searchPlaceholder="Zoek op betaler of omschrijving"
          csvName="stripe-betalingen"
          defaultSort={{ key: "when", dir: "desc" }}
          filters={[{ key: "status", label: "Status", chips: true, options: [{ value: "succeeded", label: "Geslaagd" }, { value: "failed", label: "Mislukt" }, { value: "pending", label: "In behandeling" }] }]}
          emptyText="Zodra er via Stripe betaald wordt, zie je het hier meteen."
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel flush title="Uitbetalingen naar je bank">
          {o.payouts.length === 0 ? (
            <Empty title="Nog geen uitbetalingen" body="Stripe maakt het saldo automatisch over zodra er genoeg vrijgegeven is." />
          ) : (
            <ul>
              {o.payouts.map((p) => {
                const s = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <span>
                      <span className="num block font-medium" style={{ color: "var(--a-text)" }}>{amount(p.amountCents, p.currency)}</span>
                      <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{dateNl(p.arrivalDate)}{p.destination ? `, ${p.destination}` : ""}</span>
                    </span>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel flush title="Geschillen">
          {o.disputes.length === 0 ? (
            <Empty title="Geen geschillen" body="Niemand heeft een betaling betwist." />
          ) : (
            <ul>
              {o.disputes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <span>
                    <span className="num block font-medium" style={{ color: "var(--a-text)" }}>{amount(d.amountCents, d.currency)}</span>
                    <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{DISPUTE_REASON[d.reason] ?? d.reason}</span>
                  </span>
                  <a href={d.dashboardUrl} target="_blank" rel="noopener noreferrer">
                    <Pill tone={d.open ? "crit" : d.status === "won" ? "ok" : "neutral"}>{d.open ? "Open" : d.status === "won" ? "Gewonnen" : d.status === "lost" ? "Verloren" : d.status}</Pill>
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
