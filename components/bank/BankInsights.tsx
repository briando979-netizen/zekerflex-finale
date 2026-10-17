"use client";

export interface InsightsPayload {
  insights: {
    months: { month: string; inCents: number; outCents: number }[];
    categories: { label: string; cents: number }[];
    topMerchants: { name: string; cents: number; count: number }[];
    thisMonth: { inCents: number; outCents: number };
  };
  forecast: {
    reservedCents: number;
    reservations: { label: string; amountCents: number }[];
    potsCents: number;
    items: { date: string; label: string; amountCents: number; kind: string; estimate?: boolean }[];
    projectedCents: number;
    horizonDays: number;
  };
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const MONTH = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("nl-NL", { month: "short" });
const COLORS = ["bg-brand-500", "bg-[#F59E0B]", "bg-[#6366F1]", "bg-[#EC4899]", "bg-[#14B8A6]", "bg-neutralx-400"];

/** 30-day forecast: what's reserved and what's coming in/out. */
export function BankForecast({ data, balanceCents }: { data: InsightsPayload["forecast"]; balanceCents: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-hair px-5 py-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Verwacht saldo over {data.horizonDays} dagen</span>
          <span className="block text-xs text-neutralx-500">Nu {euro(balanceCents)}, inclusief geplande af- en bijschrijvingen</span>
        </span>
        <span className={`num font-display text-2xl font-bold ${data.projectedCents < 0 ? "text-crit" : "text-ink"}`}>{euro(data.projectedCents)}</span>
      </div>
      {data.reservations.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 border-b border-hair bg-warn/5 px-5 py-2.5 text-sm">
          <span className="text-neutralx-700">⏳ {r.label}</span>
          <span className="num font-semibold text-warn">{euro(r.amountCents)} gereserveerd</span>
        </div>
      ))}
      {data.items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-neutralx-400">Niets gepland de komende {data.horizonDays} dagen.</p>
      ) : (
        <ul className="divide-y divide-hair text-sm">
          {data.items.map((i, n) => (
            <li key={`${i.date}-${n}`} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-14 flex-shrink-0 text-xs text-neutralx-500">{new Date(i.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {i.label}
                {i.estimate && <span className="ml-1 text-xs text-neutralx-400">(schatting)</span>}
              </span>
              <span className={`num font-semibold ${i.amountCents > 0 ? "text-ok" : "text-ink"}`}>
                {i.amountCents > 0 ? "+" : "−"}
                {euro(Math.abs(i.amountCents))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Income vs spending per month, spending per category, top merchants. */
export function BankInsights({ data }: { data: InsightsPayload["insights"] }) {
  const max = Math.max(1, ...data.months.flatMap((m) => [m.inCents, m.outCents]));
  const totalOut = data.categories.reduce((s, c) => s + c.cents, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Inkomsten deze maand</p>
          <p className="num mt-1 font-display text-2xl font-bold text-ok">+{euro(data.thisMonth.inCents)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Uitgaven deze maand</p>
          <p className="num mt-1 font-display text-2xl font-bold text-ink">−{euro(data.thisMonth.outCents)}</p>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-ink">Afgelopen 6 maanden</p>
        <div className="mt-4 flex h-40 items-end gap-2 sm:gap-4">
          {data.months.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div className="w-1/2 max-w-[18px] rounded-t bg-ok/80" style={{ height: `${(m.inCents / max) * 100}%` }} title={`In ${euro(m.inCents)}`} />
                <div className="w-1/2 max-w-[18px] rounded-t bg-ink/70" style={{ height: `${(m.outCents / max) * 100}%` }} title={`Uit ${euro(m.outCents)}`} />
              </div>
              <span className="text-[11px] text-neutralx-500">{MONTH(m.month)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-neutralx-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ok/80" /> inkomsten
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ink/70" /> uitgaven
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">Waar ging het naartoe (deze maand)</p>
          {totalOut === 0 ? (
            <p className="py-6 text-center text-sm text-neutralx-400">Nog geen uitgaven deze maand.</p>
          ) : (
            <>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                {data.categories.map((c, i) => (
                  <div key={c.label} className={COLORS[i % COLORS.length]} style={{ width: `${(c.cents / totalOut) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {data.categories.map((c, i) => (
                  <li key={c.label} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${COLORS[i % COLORS.length]}`} />
                    <span className="flex-1 text-neutralx-700">{c.label}</span>
                    <span className="text-xs text-neutralx-400">{Math.round((c.cents / totalOut) * 100)}%</span>
                    <span className="num w-24 text-right font-semibold">{euro(c.cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">Meeste pasbetalingen</p>
          {data.topMerchants.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutralx-400">Nog geen pasbetalingen deze maand.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hair text-sm">
              {data.topMerchants.map((m) => (
                <li key={m.name} className="flex items-center gap-3 py-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-soft text-xs font-bold text-neutralx-600">{m.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-neutralx-400">{m.count}×</span>
                  <span className="num font-semibold">{euro(m.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
