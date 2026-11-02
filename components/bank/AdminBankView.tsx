"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { count, dateTimeNl, euroExact } from "@/lib/admin/format";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, StackBar } from "@/components/admin/kit";
import { DataTable, InlineAsk, type TableRow } from "@/components/admin/kit-client";
import { AdminBankExtras } from "@/components/bank/AdminBankExtras";
import { AdminBankMonitoring } from "@/components/bank/AdminBankMonitoring";
import { AdminFastPay } from "@/components/bank/AdminFastPay";

interface Fees {
  monthlyPersonalCents: number;
  monthlyOrganisationCents: number;
  cardVirtualCents: number;
  cardPhysicalCents: number;
  negativeBalanceFeeCents: number;
}
interface Withdrawal {
  id: string;
  holderName: string;
  amountCents: number;
  iban: string;
  status: string;
  requestedAt: string;
}
interface AccountRow {
  id: string;
  ownerType: "USER" | "TENANT" | "PLATFORM";
  number: string;
  holderName: string;
  balanceCents: number;
  frozen: boolean;
  frozenReason: string | null;
  payoutIban: string | null;
}
interface Payload {
  platform: { number: string; balanceCents: number };
  totals: { personalCents: number; personalCount: number; organisationCents: number; organisationCount: number; customerCents: number; potsCents: number; pendingWithdrawalCents: number };
  stripe: { availableCents: number; pendingCents: number } | null;
  sepaConfigured: boolean;
  fees: Fees;
  withdrawals: Withdrawal[];
  accounts: AccountRow[];
}

const TYPE: Record<AccountRow["ownerType"], string> = { USER: "Persoonlijk", TENANT: "Bedrijf", PLATFORM: "Platform" };

const FEE_FIELDS = [
  ["monthlyPersonalCents", "Persoonlijk, per maand"],
  ["monthlyOrganisationCents", "Bedrijf, per maand"],
  ["cardVirtualCents", "Virtuele pas, eenmalig"],
  ["cardPhysicalCents", "Fysieke pas, eenmalig"],
  ["negativeBalanceFeeCents", "Rood staan, per week"],
] as const;

/** Correctie op een rekening: bedrag en reden horen bij elkaar, dus één formulier. */
function AdjustForm({ onSubmit }: { onSubmit: (cents: number, reason: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="a-button text-xs" onClick={() => setOpen(true)}>Correctie</button>;
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  return (
    <form
      className="inline-flex max-w-full flex-wrap items-center justify-end gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!cents || !reason.trim()) return;
        await onSubmit(cents, reason.trim());
        setOpen(false);
        setAmount("");
        setReason("");
      }}
    >
      <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="12,50 of -5" aria-label="Correctiebedrag in euro, negatief is afschrijven" className="a-input !w-28 !py-1 text-[0.8125rem]" />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reden, komt op het afschrift" aria-label="Reden van de correctie" className="a-input !w-52 !py-1 text-[0.8125rem]" />
      <button type="submit" className="a-button a-button-primary text-xs" disabled={!cents || !reason.trim()}>Boeken</button>
      <button type="button" className="a-button text-xs" onClick={() => setOpen(false)}>Annuleren</button>
    </form>
  );
}

export function AdminBankView({ chart }: { chart?: ReactNode }) {
  const [data, setData] = useState<Payload | null>(null);
  const [fees, setFees] = useState<Record<keyof Fees, string> | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bank", { cache: "no-store" });
    if (!res.ok) return;
    const d: Payload = await res.json();
    setData(d);
    setFees(Object.fromEntries(Object.entries(d.fees).map(([k, v]) => [k, (v / 100).toFixed(2).replace(".", ",")])) as Record<keyof Fees, string>);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown, ok: string) {
    setNote(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setNote({ ok: false, text: d?.error?.message ?? "Mislukt." });
      return;
    }
    setNote({ ok: true, text: ok });
    await load();
  }

  async function exportBatch() {
    setNote(null);
    const res = await fetch("/api/admin/bank/withdrawals");
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNote({ ok: false, text: d?.error?.message ?? "Exporteren mislukt." });
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zekerflex-bank-opnames-${new Date().toISOString().slice(0, 10)}.xml`;
    a.click();
    const skipped = decodeURIComponent(res.headers.get("X-Skipped") ?? "");
    setNote({ ok: true, text: `SEPA-batch gedownload. Upload hem bij de zakelijke bank en zet de opnames daarna op uitbetaald.${skipped ? ` Overgeslagen: ${skipped}` : ""}` });
    await load();
  }

  const head = <PageHead title="ZekerFlex Bank" subtitle="Alle rekeningen, wat het platform aan klanten verschuldigd is, kosten en uitbetalingen." />;

  if (!data || !fees) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }

  const covered = data.stripe ? data.stripe.availableCents + data.stripe.pendingCents >= data.totals.customerCents : null;

  const accountRows: TableRow[] = data.accounts.map((a) => ({
    id: a.id,
    search: `${a.holderName} ${a.number.replace(/\s/g, "")} ${a.number}`,
    filters: { type: a.ownerType, state: a.frozen ? "frozen" : "ok" },
    cells: {
      holder: (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium" style={{ color: "var(--a-text)" }}>{a.holderName}</span>
          {a.frozen && <Pill tone="crit">Geblokkeerd</Pill>}
        </span>
      ),
      type: TYPE[a.ownerType],
      number: <span className="font-mono text-xs">{a.number}</span>,
      balance: <span className="font-medium" style={{ color: a.balanceCents < 0 ? "var(--a-crit)" : "var(--a-text)" }}>{euroExact(a.balanceCents)}</span>,
      actions: (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {a.ownerType !== "PLATFORM" &&
            (a.frozen ? (
              <button type="button" className="a-button text-xs" onClick={() => void call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "unfreeze" }, "Rekening gedeblokkeerd.")}>Deblokkeren</button>
            ) : (
              <InlineAsk label="Blokkeren" question={`Waarom ${a.holderName} blokkeren?`} placeholder="Reden" required submitLabel="Blokkeren" onSubmit={(reason) => call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "freeze", reason }, "Rekening geblokkeerd.")} />
            ))}
          <AdjustForm onSubmit={(amountCents, reason) => call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "adjust", amountCents, reason }, "Correctie geboekt.")} />
        </span>
      ),
    },
    sort: { holder: a.holderName, type: TYPE[a.ownerType], number: a.number, balance: a.balanceCents },
    csv: { holder: a.holderName, type: TYPE[a.ownerType], number: a.number, balance: (a.balanceCents / 100).toFixed(2), actions: "" },
  }));

  return (
    <div className="space-y-4">
      {head}
      {note && <Notice tone={note.ok ? "ok" : "crit"}>{note.text}</Notice>}

      <KpiStrip
        items={[
          { label: "Platformrekening", value: euroExact(data.platform.balanceCents), hint: data.platform.number, tone: "money" },
          { label: "Tegoed van klanten", value: euroExact(data.totals.customerCents), hint: `${count(data.totals.personalCount)} persoonlijk, ${count(data.totals.organisationCount)} bedrijf` },
          { label: "Stripe-saldo", value: data.stripe ? euroExact(data.stripe.availableCents + data.stripe.pendingCents) : "—", hint: data.stripe ? `${euroExact(data.stripe.availableCents)} beschikbaar` : "niet opgehaald" },
          { label: "Opnames te betalen", value: euroExact(data.totals.pendingWithdrawalCents), hint: `${count(data.withdrawals.length)} ${data.withdrawals.length === 1 ? "opname" : "opnames"}`, ...(data.totals.pendingWithdrawalCents > 0 ? { tone: "warn" as const } : {}) },
        ]}
      />

      {covered === false && <Notice tone="crit" role="alert">Het Stripe-saldo is lager dan het totale tegoed van klanten. Vul het platformsaldo aan of houd uitbetalingen tegen tot dit klopt.</Notice>}

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        {chart}
        <Panel title="Waar het klantgeld staat">
          <StackBar
            format={euroExact}
            emptyText="Nog geen tegoeden op klantrekeningen."
            segments={[
              { label: "Persoonlijke rekeningen", value: Math.max(0, data.totals.personalCents), slot: 1 },
              { label: "Bedrijfsrekeningen", value: Math.max(0, data.totals.organisationCents), slot: 3 },
              { label: "Potjes en deposito's", value: Math.max(0, data.totals.potsCents), slot: 7 },
            ]}
          />
        </Panel>
      </div>

      <Panel
        flush
        title="Opnames"
        subtitle="Wachten op uitbetaling"
        actions={
          <button type="button" onClick={() => void exportBatch()} disabled={!data.sepaConfigured || !data.withdrawals.some((w) => w.status === "pending")} className="a-button a-button-primary text-xs">
            SEPA-batch downloaden
          </button>
        }
      >
        {!data.sepaConfigured && <div className="px-4 pb-3 sm:px-5"><Notice tone="warn">SEPA_CREDITOR_IBAN en SEPA_CREDITOR_NAME (de zakelijke rekening van ZekerFlex) zijn nog niet ingesteld.</Notice></div>}
        {data.withdrawals.length === 0 ? (
          <Empty title="Geen opnames" body="Er wacht niets op uitbetaling." />
        ) : (
          <ul>
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-[12rem] flex-1">
                  <span className="block font-medium" style={{ color: "var(--a-text)" }}>{w.holderName}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{w.iban}, {dateTimeNl(w.requestedAt)}</span>
                </span>
                <Pill tone={w.status === "pending" ? "warn" : "plan"}>{w.status === "pending" ? "Klaar voor export" : "In batch"}</Pill>
                <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{euroExact(w.amountCents)}</span>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => void call("/api/admin/bank/withdrawals", "POST", { id: w.id, action: "paid" }, "Op uitbetaald gezet.")} className="a-button text-xs">Uitbetaald</button>
                  <InlineAsk label="Terugboeken" question="Reden van terugboeken?" placeholder="Reden" required submitLabel="Terugboeken" onSubmit={(reason) => call("/api/admin/bank/withdrawals", "POST", { id: w.id, action: "reverse", reason }, "Teruggeboekt.")} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel flush title="Rekeningen" subtitle={`${count(data.accounts.length)} rekeningen`}>
        <DataTable
          columns={[
            { key: "holder", label: "Houder" },
            { key: "type", label: "Soort", hideOnMobile: true },
            { key: "number", label: "Rekening", hideOnMobile: true },
            { key: "balance", label: "Saldo", align: "right" },
            { key: "actions", label: "", align: "right", sortable: false },
          ]}
          rows={accountRows}
          pageSize={15}
          searchPlaceholder="Zoek naam of rekeningnummer"
          csvName="bank-rekeningen"
          filters={[
            { key: "type", label: "Soort", chips: true, options: [{ value: "USER", label: "Persoonlijk" }, { value: "TENANT", label: "Bedrijf" }, { value: "PLATFORM", label: "Platform" }] },
            { key: "state", label: "Status", options: [{ value: "frozen", label: "Geblokkeerd" }, { value: "ok", label: "Actief" }] },
          ]}
          defaultSort={{ key: "balance", dir: "desc" }}
          emptyText="Nog geen rekeningen."
        />
      </Panel>

      <AdminBankMonitoring />

      <AdminFastPay />

      <AdminBankExtras />

      <Panel title="Kosten" subtitle="Wat klanten betalen voor hun rekening en pas">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {FEE_FIELDS.map(([k, label]) => (
            <label key={k} className="a-label">
              {label} (€)
              <input inputMode="decimal" value={fees[k]} onChange={(e) => setFees({ ...fees, [k]: e.target.value })} className="a-input" />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void call("/api/admin/bank/fees", "PUT", Object.fromEntries(Object.entries(fees).map(([k, v]) => [k, Math.round(Number(v.replace(",", ".")) * 100) || 0])), "Kosten opgeslagen.")}
          className="a-button a-button-primary mt-3"
        >
          Kosten opslaan
        </button>
      </Panel>
    </div>
  );
}
