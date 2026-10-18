"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cockpit as Data } from "@/lib/admin/cockpit";

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const num = (n: number) => n.toLocaleString("nl-NL");

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-neutralx-400">nieuw</span>;
  return <span className={`text-xs font-semibold ${pct >= 0 ? "text-ok" : "text-crit"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toLocaleString("nl-NL")}% vs vorige maand</span>;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean }) {
  return (
    // no .card on the accent tile: the admin theme forces .card's background with !important
    <div className={accent ? "rounded-2xl bg-gradient-to-br from-[#0E5C4A] to-[#062a22] p-5 text-white" : "card p-5"}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? "text-white/60" : "text-neutralx-500"}`}>{label}</p>
      <p className={`num mt-2 font-display text-3xl font-bold ${accent ? "text-white" : "text-ink"}`}>{value}</p>
      {sub && <div className={`mt-1 text-xs ${accent ? "text-white/70" : "text-neutralx-500"}`}>{sub}</div>}
    </div>
  );
}

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

  if (!d) return <p className="py-16 text-center text-sm text-neutralx-400">Cockpit laden…</p>;
  const max = Math.max(1, ...d.daily.map((x) => x.gmvCents));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-ink">Cockpit</h1>
          <p className="mt-1 text-sm text-neutralx-600">Live uit de database · ververst elke 30 seconden · {new Date(d.generatedAt).toLocaleTimeString("nl-NL")}</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" /> live
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi accent label="Omzet ZekerFlex deze maand" value={euro(d.revenue.thisMonthCents)} sub={<Delta pct={d.revenue.growthPct} />} />
        <Kpi label="Prognose deze maand" value={euro(d.revenue.runRateMonthCents)} sub={`Jaartempo (ARR) ${euro(d.revenue.arrCents)}`} />
        <Kpi label="Volume via platform (GMV)" value={euro(d.gmv.thisMonthCents)} sub={<Delta pct={d.gmv.growthPct} />} />
        <Kpi label="Bankinkomsten deze maand" value={euro(d.bankIncome.thisMonthCents)} sub="kosten, premies, pas- en voorschotvergoeding" />
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-ink">Laatste 30 dagen</p>
        <div className="mt-4 flex h-44 items-end gap-[3px]">
          {d.daily.map((x) => (
            <div key={x.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${x.day}: volume ${euro(x.gmvCents)}, omzet ${euro(x.revenueCents)}`}>
              <div className="w-full rounded-t bg-brand-500/25" style={{ height: `${(x.gmvCents / max) * 100}%` }}>
                <div className="w-full rounded-t bg-brand-500" style={{ height: `${x.gmvCents ? (x.revenueCents / x.gmvCents) * 100 : 0}%`, marginTop: "auto" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-neutralx-400">
          <span>{d.daily[0]?.day.slice(5)}</span>
          <span>vandaag</span>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-neutralx-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-500/25" /> volume
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> omzet ZekerFlex
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Gebruikers" value={num(d.users.total)} sub={<>{num(d.users.freelancers)} freelancers · +{num(d.users.newThisMonth)} deze maand <Delta pct={d.users.growthPct} /></>} />
        <Kpi label="Actief (7 dagen)" value={num(d.users.active7d)} sub={`${d.users.total ? Math.round((d.users.active7d / d.users.total) * 100) : 0}% van alle gebruikers`} />
        <Kpi label="Bedrijven" value={num(d.companies.total)} sub={`+${num(d.companies.newThisMonth)} deze maand`} />
        <Kpi label="Klussen deze maand" value={num(d.shifts.thisMonth)} sub={`${d.shifts.fillRatePct}% bezet · ${num(d.shifts.upcoming)} gepland`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">ZekerFlex Bank</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-neutralx-500">Rekeningen</dt>
              <dd className="num font-display text-xl font-bold">{num(d.bank.accounts)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutralx-500">Actieve passen</dt>
              <dd className="num font-display text-xl font-bold">{num(d.bank.cards)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutralx-500">Tegoed klanten</dt>
              <dd className="num font-display text-xl font-bold">{euro(d.bank.customerCents + d.bank.potsCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutralx-500">Platformrekening</dt>
              <dd className="num font-display text-xl font-bold">{euro(d.bank.platformCents)}</dd>
            </div>
          </dl>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">Grootste opdrachtgevers deze maand</p>
          {d.topCompanies.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutralx-400">Nog geen facturen deze maand.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {d.topCompanies.map((c, i) => (
                <li key={c.name + i} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-paper-soft text-xs font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="num font-semibold">{euro(c.gmvCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {rewards && (
        <div className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-ink">🎁 Verwijsbonus</p>
            <p className="text-xs text-neutralx-500">Uitbetaald vanaf de platformrekening zodra de nieuwe gebruiker zijn eerste klus afrondt.</p>
          </div>
          {(["referrerCents", "newUserCents"] as const).map((k) => (
            <label key={k} className="text-xs font-semibold text-neutralx-600">
              {k === "referrerCents" ? "Uitnodiger" : "Nieuwe gebruiker"}
              <span className="mt-1 flex items-center gap-1">
                €
                <input
                  inputMode="decimal"
                  defaultValue={(rewards[k] / 100).toFixed(0)}
                  onBlur={(e) => setRewards({ ...rewards, [k]: Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0 })}
                  className="w-20 rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm"
                />
              </span>
            </label>
          ))}
          <button
            type="button"
            onClick={async () => {
              const r = await fetch("/api/admin/rewards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rewards) });
              setNote(r.ok ? "Verwijsbonus opgeslagen." : "Opslaan mislukt.");
            }}
            className="btn-primary text-sm"
          >
            Opslaan
          </button>
          {note && <p className="w-full text-xs text-ok">{note}</p>}
        </div>
      )}
    </div>
  );
}
