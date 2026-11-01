"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cockpit as Data } from "@/lib/admin/cockpit";
import { count, euro, percentOf } from "@/lib/admin/format";
import { BarList, InfoList, KpiStrip, Meter, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";

/** Live admin cockpit — refreshes every 30 seconds. */
export function Cockpit() {
  const [d, setD] = useState<Data | null>(null);
  const [rewards, setRewards] = useState<{ referrerCents: number; newUserCents: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/cockpit", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    void load();
    void fetch("/api/admin/rewards")
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && setRewards(x.rewards));
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const head = (
    <PageHead
      title="Cockpit"
      subtitle={d ? `Live uit de database. Bijgewerkt om ${new Date(d.generatedAt).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam" })}, ververst elke 30 seconden.` : "Live uit de database, ververst elke 30 seconden."}
      meta={<Pill tone="ok">Live</Pill>}
    />
  );

  if (!d) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {head}

      <KpiStrip
        items={[
          { label: "Omzet deze maand", value: euro(d.revenue.thisMonthCents), delta: d.revenue.growthPct, hint: "t.o.v. vorige maand", tone: "money", spark: d.daily.map((x) => x.revenueCents) },
          { label: "Prognose deze maand", value: euro(d.revenue.runRateMonthCents), hint: `Jaartempo ${euro(d.revenue.arrCents)}` },
          { label: "Volume via platform", value: euro(d.gmv.thisMonthCents), delta: d.gmv.growthPct, hint: "t.o.v. vorige maand", spark: d.daily.map((x) => x.gmvCents) },
          { label: "Bankinkomsten deze maand", value: euro(d.bankIncome.thisMonthCents), hint: "kosten, premies, pas en voorschot" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Volume en eigen omzet" subtitle="De laatste 30 dagen">
          <Chart
            title="Volume via het platform en eigen omzet per dag"
            kind="line"
            unit="money"
            labels={d.daily.map((x) => x.day)}
            series={[
              { label: "Volume", values: d.daily.map((x) => x.gmvCents), slot: 3 },
              { label: "Eigen omzet", values: d.daily.map((x) => x.revenueCents), slot: 1 },
            ]}
            height={230}
            emptyText="Nog geen facturen in de laatste 30 dagen."
          />
        </Panel>
        <Panel title="Grootste opdrachtgevers" subtitle="Volume deze maand">
          <BarList emptyText="Nog geen facturen deze maand." rows={d.topCompanies.map((c, i) => ({ key: `${c.name}-${i}`, label: c.name, value: c.gmvCents, display: euro(c.gmvCents) }))} />
        </Panel>
      </div>

      <KpiStrip
        items={[
          { label: "Gebruikers", value: count(d.users.total), delta: d.users.growthPct, hint: `+${count(d.users.newThisMonth)} deze maand`, href: "/admin/gebruikers" },
          { label: "Actief, 7 dagen", value: count(d.users.active7d), hint: `${percentOf(d.users.active7d, d.users.total)}% van alle gebruikers` },
          { label: "Bedrijven", value: count(d.companies.total), hint: `+${count(d.companies.newThisMonth)} deze maand`, href: "/admin/bedrijven" },
          { label: "Klussen deze maand", value: count(d.shifts.thisMonth), hint: `${count(d.shifts.upcoming)} gepland` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Bezetting deze maand" subtitle="Klussen met minstens één ingeplande werker">
          <div className="space-y-4">
            <Meter label="Bezet" value={d.shifts.filledThisMonth} max={d.shifts.thisMonth} display={`${count(d.shifts.filledThisMonth)} van ${count(d.shifts.thisMonth)}, ${d.shifts.fillRatePct}%`} tone="ok" />
            <Meter label="Freelancers met profiel" value={d.users.freelancers} max={d.users.total} display={`${count(d.users.freelancers)} van ${count(d.users.total)} gebruikers`} tone="plan" />
          </div>
        </Panel>
        <Panel title="ZekerFlex Bank" subtitle="Rekeningen en tegoeden">
          <InfoList
            rows={[
              { label: "Rekeningen", value: count(d.bank.accounts) },
              { label: "Actieve passen", value: count(d.bank.cards) },
              { label: "Tegoed klanten", value: euro(d.bank.customerCents + d.bank.potsCents) },
              { label: "Platformrekening", value: euro(d.bank.platformCents) },
            ]}
          />
        </Panel>
      </div>

      {rewards && (
        <Panel title="Verwijsbonus" subtitle="Uitbetaald vanaf de platformrekening zodra de nieuwe gebruiker de eerste klus afrondt.">
          <div className="flex flex-wrap items-end gap-3">
            {(["referrerCents", "newUserCents"] as const).map((k) => (
              <label key={k} className="a-label">
                {k === "referrerCents" ? "Uitnodiger (€)" : "Nieuwe gebruiker (€)"}
                <input
                  inputMode="decimal"
                  defaultValue={(rewards[k] / 100).toFixed(0)}
                  onBlur={(e) => setRewards({ ...rewards, [k]: Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0 })}
                  className="a-input !w-32"
                />
              </label>
            ))}
            <button
              type="button"
              onClick={async () => {
                const r = await fetch("/api/admin/rewards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rewards) });
                setNote(r.ok ? "Verwijsbonus opgeslagen." : "Opslaan mislukt.");
              }}
              className="a-button a-button-primary"
            >
              Opslaan
            </button>
            {note && <p role="status" className="text-xs" style={{ color: "var(--a-dim)" }}>{note}</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}
