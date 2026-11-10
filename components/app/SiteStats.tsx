"use client";

import { useEffect, useState } from "react";
import { SOURCE_LABEL, type SiteStats as Stats } from "@/lib/sites/stats-shared";
import { bouwerUrl } from "@/lib/sites/paginabouwer";
import type { SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Tabblad "Bezoekers" in de websitebouwer: hoe vaak de pagina's van de eigen
// website (of webshop) bekeken worden en waar bezoekers vandaan komen (lib/sites/stats.ts).
// Eén reeks in de merkkleur; in het donkere thema een lichtere stap, want het
// donkergroen haalt op de donkere kaart geen 3:1. Elke staaf is een knop met
// dezelfde uitleg bij hover en focus, en de tabel eronder heeft alle getallen.
// ---------------------------------------------------------------------------

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
interface Data {
  dagen: Range;
  stats: Stats;
  pages: { slug: string; titel: string }[];
}
interface Column {
  label: string;
  long: string;
  views: number;
  entries: number;
}

// the app's dark theme is a data attribute (EmployerShell), not Tailwind's dark: (that follows the OS)
const BAR = "bg-brand-500 [.app-scope[data-theme=dark]_&]:bg-brand-300";
const LINK = "text-brand-600 [.app-scope[data-theme=dark]_&]:text-brand-300";
// the chosen period: ink in light; ink on a dark card is invisible, so a light pill in dark
const PICKED = "bg-ink text-white [.app-scope[data-theme=dark]_&]:bg-[#F2F3F0] [.app-scope[data-theme=dark]_&]:text-[#0B0D11]";
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const nf = new Intl.NumberFormat("nl-NL");

/** "2026-11-03" → "3 nov" (or "di 3 nov"), from the key itself: no time zone involved. */
function dayLabel(key: string, weekday = false): string {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1] ?? ""}`;
  return weekday ? `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ""} ${base}` : base;
}

/** One column per day; for 90 days one per 7 days, counted back from today. */
function columns(days: Stats["days"]): Column[] {
  if (days.length <= 31) return days.map((d) => ({ label: dayLabel(d.day), long: dayLabel(d.day, true), views: d.views, entries: d.entries }));
  const out: Column[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 7), end);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;
    out.unshift({
      label: dayLabel(first.day),
      long: `${dayLabel(first.day)} – ${dayLabel(last.day)}`,
      views: chunk.reduce((n, d) => n + d.views, 0),
      entries: chunk.reduce((n, d) => n + d.entries, 0),
    });
  }
  return out;
}

/** The top of the axis: the first round number at or above the highest bar. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  const nice = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((f) => f * step >= max) ?? 10;
  return Math.max(1, Math.round(nice * step));
}

/** `soort`: the company's website or its webshop (each its own site and figures); null = the website. */
export default function SiteStats({ published, soort = null }: { published: boolean; soort?: SiteSoort | null }) {
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const woord = soort === "webshop" ? "webshop" : "website";

  useEffect(() => {
    let stop = false;
    fetch(bouwerUrl("/api/werkgever/sites", "/stats", soort, `dagen=${range}`), { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as (Data & { error?: { message?: string } }) | null;
        if (stop) return;
        if (r.ok && d) {
          setData(d);
          setError(null);
        } else setError(d?.error?.message ?? "De bezoekerscijfers konden niet worden geladen. Probeer het later opnieuw.");
      })
      .catch(() => !stop && setError("De bezoekerscijfers konden niet worden geladen. Probeer het later opnieuw."))
      .finally(() => !stop && setLoading(false));
    return () => {
      stop = true;
    };
  }, [range, soort]);

  const pick = (r: Range) => {
    if (r === range) return;
    setLoading(true);
    setActive(null);
    setRange(r);
  };

  const s = data?.stats;
  const cols = s ? columns(s.days) : [];
  const titleOf = (slug: string) => data?.pages.find((p) => p.slug === slug)?.titel || (slug ? `/${slug}` : "Home");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Periode">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => pick(r)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${range === r ? PICKED : "text-neutralx-600 hover:bg-paper-soft"}`}>
            {r} dagen
          </button>
        ))}
      </div>
      {!published && <p className="text-sm text-neutralx-500">Je {woord} staat nog niet online. Zodra hij online staat, zie je hier hoeveel mensen hem bekijken en waar ze vandaan komen.</p>}
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      {!s && !error && <p className="text-sm text-neutralx-500">Laden…</p>}
      {s && (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <dl className="grid grid-cols-3 gap-2">
            <Tile label="Bekeken pagina's" value={nf.format(s.views)} />
            <Tile label="Binnenkomsten" value={nf.format(s.entries)} />
            <Tile label="Op telefoon" value={s.views ? `${Math.round((s.mobile / s.views) * 100)}%` : "–"} />
          </dl>
          {s.views === 0 ? (
            <p className="text-sm text-neutralx-500">Nog geen bezoekers in deze periode. Elke keer dat iemand een pagina van je {woord} opent, telt hier mee.</p>
          ) : (
            <>
              <BarChart cols={cols} active={active} onActive={setActive} perWeek={s.days.length > 31} />
              <Ranked title="Meest bekeken pagina's" rows={s.pages.slice(0, 6).map((p) => ({ label: titleOf(p.slug), value: p.views }))} />
              {s.sources.length > 0 && <Ranked title="Waar bezoekers vandaan komen" rows={s.sources.map((x) => ({ label: SOURCE_LABEL[x.source], value: x.entries }))} />}
              <details className="text-sm">
                <summary className={`cursor-pointer text-xs font-semibold ${LINK}`}>Alle getallen als tabel</summary>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-neutralx-500">
                      <th scope="col" className="py-1 font-medium">{s.days.length > 31 ? "Week" : "Dag"}</th>
                      <th scope="col" className="py-1 text-right font-medium">Bekeken</th>
                      <th scope="col" className="py-1 text-right font-medium">Binnenkomsten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cols.map((c) => (
                      <tr key={c.long} className="border-t border-hair">
                        <td className="py-1 text-neutralx-600">{c.long}</td>
                        <td className="py-1 text-right tabular-nums text-ink">{nf.format(c.views)}</td>
                        <td className="py-1 text-right tabular-nums text-ink">{nf.format(c.entries)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
          <p className="text-xs leading-relaxed text-neutralx-400">
            Geteld zonder cookies en zonder iets over je bezoekers te bewaren. Een binnenkomst is elke keer dat iemand je {woord} opent; klikken binnen je {woord} tellen als bekeken pagina&apos;s. Zoekmachines en andere robots tellen niet mee.
          </p>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hair p-2">
      <dt className="text-[11px] leading-tight text-neutralx-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}

function BarChart({ cols, active, onActive, perWeek }: { cols: Column[]; active: number | null; onActive: (i: number | null) => void; perWeek: boolean }) {
  const top = niceMax(Math.max(0, ...cols.map((c) => c.views)));
  const shown = active === null ? null : (cols[active] ?? null);
  const first = cols[0];
  const last = cols[cols.length - 1];
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-semibold text-ink">{perWeek ? "Bekeken pagina's per week" : "Bekeken pagina's per dag"}</figcaption>
      <div className="relative pt-2">
        <div className="flex gap-1.5">
          <div className="flex h-28 flex-col justify-between text-right text-[10px] tabular-nums leading-none text-neutralx-400" aria-hidden>
            <span>{nf.format(top)}</span>
            <span>0</span>
          </div>
          <div className="relative h-28 flex-1">
            <div className="absolute inset-x-0 top-0 border-t border-hair" aria-hidden />
            <div className="absolute inset-x-0 top-1/2 border-t border-hair" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 border-t border-hairstrong" aria-hidden />
            <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => onActive(null)}>
              {cols.map((c, i) => (
                <button
                  key={c.long}
                  type="button"
                  aria-label={`${c.long}: ${nf.format(c.views)} bekeken, ${nf.format(c.entries)} binnenkomsten`}
                  onMouseEnter={() => onActive(i)}
                  onFocus={() => onActive(i)}
                  onBlur={() => onActive(null)}
                  className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  {c.views > 0 && <span className={`block w-full max-w-[24px] rounded-t ${BAR} ${active === i ? "opacity-75" : ""}`} style={{ height: `${(c.views / top) * 100}%` }} />}
                </button>
              ))}
            </div>
            {/* floats over the top of the plot, next to the bar: no empty band reserved for it */}
            {shown && active !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-hair bg-white px-2 py-1 text-xs shadow-sm"
                style={{ left: `${Math.min(75, Math.max(25, ((active + 0.5) / cols.length) * 100))}%` }}
              >
                <p><strong className="text-ink">{nf.format(shown.views)}</strong> <span className="text-neutralx-500">bekeken</span> · <strong className="text-ink">{nf.format(shown.entries)}</strong> <span className="text-neutralx-500">binnenkomsten</span></p>
                <p className="text-neutralx-400">{shown.long}</p>
              </div>
            )}
          </div>
        </div>
        {first && last && (
          <div className="flex justify-between pl-6 pt-1 text-[10px] text-neutralx-400" aria-hidden>
            <span>{first.label}</span>
            <span>{last.label}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

function Ranked({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section>
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-neutralx-600">{r.label}</span>
              <span className="tabular-nums text-ink">{nf.format(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-paper-soft" aria-hidden>
              <div className={`h-1.5 rounded-full ${BAR}`} style={{ width: `${(r.value / top) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
