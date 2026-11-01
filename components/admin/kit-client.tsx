"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatTick, formatValue, type ChartUnit } from "@/lib/admin/format";

// ---------------------------------------------------------------------------
// De onderdelen die een browser nodig hebben: grafieken met meebewegende uitleg en
// tabellen met zoeken, filteren, sorteren en CSV. Grafiekregels: dunne lijnen en
// balken, haarlijnen op de achtergrond, één as, legenda bij twee of meer reeksen en
// altijd een tabelweergave, zodat niets alleen via kleur of muis te lezen is.
// ---------------------------------------------------------------------------

export interface ChartSeries {
  label: string;
  values: number[];
  /** Kleurplek 1 t/m 8. Volgt de reeks, niet de rangorde. */
  slot?: number;
}

const SERIES_COLOR = (slot: number) => `var(--a-s${((slot - 1) % 8) + 1})`;
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "2026-10-03" wordt "3 okt", "2026-10" wordt "okt". Andere labels blijven zoals ze zijn. */
function shortLabel(raw: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw);
  if (!m) return raw;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${Number(m[3])} ${month}` : `${month}`;
}
function longLabel(raw: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw);
  if (!m) return raw;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

/** Ronde asgetallen: 0 / 5 / 10 / 15, nooit 0 / 3,75 / 7,5. */
function niceScale(max: number, unit: ChartUnit): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0] };
  const base = unit === "money" ? 100 : 1; // munteenheid: rond op hele euro's
  const raw = max / base / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (unit === "count" || unit === "money") step = Math.max(step, 1);
  const stepped = step * base;
  const top = Math.ceil(max / stepped) * stepped;
  const ticks: number[] = [];
  for (let v = 0; v <= top + stepped / 2; v += stepped) ticks.push(v);
  return { top, ticks };
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--a-dim)" }}>
      {series.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLOR(s.slot ?? i + 1) }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTable({ labels, series, unit }: { labels: string[]; series: ChartSeries[]; unit: ChartUnit }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-[0.8125rem]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--a-border)" }}>
            <th className="py-1.5 pr-3 text-left">Periode</th>
            {series.map((s) => <th key={s.label} className="py-1.5 pl-3 text-right">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label} style={{ borderBottom: "1px solid var(--a-border)" }}>
              <td className="py-1.5 pr-3" style={{ color: "var(--a-dim)" }}>{longLabel(label)}</td>
              {series.map((s) => <td key={s.label} className="num py-1.5 pl-3 text-right" style={{ color: "var(--a-text)" }}>{formatValue(s.values[i] ?? 0, unit)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lijn- of balkgrafiek over de tijd. Bij twee of meer reeksen in balken staan ze gestapeld. */
export function Chart({
  labels,
  series,
  kind = "line",
  unit = "count",
  height = 220,
  title,
  emptyText = "Nog geen gegevens in deze periode.",
}: {
  labels: string[];
  series: ChartSeries[];
  kind?: "line" | "bars";
  unit?: ChartUnit;
  height?: number;
  /** Voor schermlezers: wat deze grafiek toont. */
  title: string;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const gradientId = useId();
  const n = labels.length;

  const stackedTotals = useMemo(() => labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)), [labels, series]);
  const peak = kind === "bars" ? Math.max(0, ...stackedTotals) : Math.max(0, ...series.flatMap((s) => s.values));
  const isEmpty = peak === 0;
  const { top, ticks } = niceScale(peak, unit);

  const tickWidth = Math.max(...ticks.map((t) => formatTick(t, unit).length), 1) * 6.4 + 10;
  const pad = { left: Math.ceil(tickWidth), right: 14, top: 10, bottom: 24 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const band = n > 0 ? plotW / n : 0;
  const x = (i: number) => (kind === "bars" ? pad.left + band * i + band / 2 : pad.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2));

  const indexAt = (clientX: number, box: DOMRect) => {
    const px = clientX - box.left - pad.left;
    const idx = kind === "bars" ? Math.floor(px / (band || 1)) : Math.round(px / ((plotW || 1) / Math.max(1, n - 1)));
    return Math.max(0, Math.min(n - 1, idx));
  };
  const onMove = (e: MouseEvent<SVGSVGElement>) => setHover(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    if (e.key === "Escape") setHover(null);
  };

  // Maximaal zeven asdatums, gelijk verdeeld, de laatste altijd zichtbaar.
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.min(7, Math.floor(plotW / 64) || 2))));
  const labelFor = (i: number) => (n - 1 - i) % labelEvery === 0;

  const barW = Math.min(24, Math.max(2, band * 0.62));
  const single = series.length === 1 && kind === "line";
  const firstColor = SERIES_COLOR(series[0]?.slot ?? 1);
  const pathOf = (s: ChartSeries) => s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const tipLeft = hover !== null ? x(hover) : 0;
  const tipOnLeft = tipLeft > width * 0.62;

  return (
    <figure className="m-0">
      <div className="mb-2 flex min-h-[1.25rem] flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? <Legend series={series} /> : <span />}
        {!isEmpty && (
          <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "var(--a-mute)" }} aria-pressed={asTable}>
            {asTable ? "Grafiek" : "Tabel"}
          </button>
        )}
      </div>
      {asTable ? (
        <ChartTable labels={labels} series={series} unit={unit} />
      ) : (
        <div ref={ref} className="relative" style={{ height }}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={title}
              tabIndex={isEmpty ? undefined : 0}
              onMouseMove={isEmpty ? undefined : onMove}
              onMouseLeave={() => setHover(null)}
              onKeyDown={isEmpty ? undefined : onKey}
              onBlur={() => setHover(null)}
              className="block rounded outline-none focus-visible:outline-2"
              style={{ touchAction: "pan-y" }}
            >
              {single && (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={firstColor} stopOpacity="0.14" />
                    <stop offset="100%" stopColor={firstColor} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
              )}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--a-axis)" : "var(--a-grid)"} strokeWidth="1" shapeRendering="crispEdges" />
                  <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--a-mute)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatTick(t, unit)}
                  </text>
                </g>
              ))}
              {labels.map((label, i) =>
                labelFor(i) ? (
                  <text key={label} x={x(i)} y={height - 7} textAnchor={kind === "line" && i === n - 1 ? "end" : kind === "line" && i === 0 ? "start" : "middle"} fontSize="11" fill="var(--a-mute)">
                    {shortLabel(label)}
                  </text>
                ) : null,
              )}

              {kind === "bars" && hover !== null && <rect x={pad.left + band * hover} y={pad.top} width={band} height={plotH} fill="var(--a-elev)" opacity="0.7" />}

              {kind === "bars" &&
                labels.map((label, i) => {
                  let base = 0;
                  const segs = series.map((s, si) => ({ value: s.values[i] ?? 0, slot: s.slot ?? si + 1 })).filter((seg) => seg.value > 0);
                  return (
                    <g key={label}>
                      {segs.map((seg, si) => {
                        const y1 = y(base + seg.value);
                        const y0 = y(base);
                        base += seg.value;
                        const isTop = si === segs.length - 1;
                        const h = Math.max(1, y0 - y1 - (si > 0 ? 2 : 0));
                        const left = x(i) - barW / 2;
                        const r = Math.min(4, barW / 2, h);
                        return isTop ? (
                          <path key={seg.slot} d={`M${left},${y1 + h} V${y1 + r} Q${left},${y1} ${left + r},${y1} H${left + barW - r} Q${left + barW},${y1} ${left + barW},${y1 + r} V${y1 + h} Z`} fill={SERIES_COLOR(seg.slot)} />
                        ) : (
                          <rect key={seg.slot} x={left} y={y1} width={barW} height={h} fill={SERIES_COLOR(seg.slot)} />
                        );
                      })}
                    </g>
                  );
                })}

              {kind === "line" && !isEmpty && single && <path d={`${pathOf(series[0]!)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={`url(#${gradientId})`} />}
              {kind === "line" && !isEmpty &&
                series.map((s, si) => <path key={s.label} d={pathOf(s)} fill="none" stroke={SERIES_COLOR(s.slot ?? si + 1)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}

              {kind === "line" && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--a-axis)" strokeWidth="1" shapeRendering="crispEdges" />}
              {kind === "line" && !isEmpty &&
                series.map((s, si) => {
                  const at = hover ?? n - 1;
                  return <circle key={s.label} cx={x(at)} cy={y(s.values[at] ?? 0)} r="4" fill={SERIES_COLOR(s.slot ?? si + 1)} stroke="var(--a-panel)" strokeWidth="2" />;
                })}
            </svg>
          )}
          {isEmpty && width > 0 && (
            <p className="pointer-events-none absolute inset-x-0 text-center text-xs" style={{ top: pad.top + plotH / 2 - 8, color: "var(--a-mute)" }}>{emptyText}</p>
          )}
          {hover !== null && !isEmpty && (
            <div
              className="pointer-events-none absolute z-10 w-max min-w-[8.5rem] max-w-[15rem] rounded-lg px-3 py-2 text-xs"
              style={{ top: 4, left: tipLeft, transform: tipOnLeft ? "translateX(calc(-100% - 12px))" : "translateX(12px)", background: "var(--a-panel)", border: "1px solid var(--a-border-strong)", boxShadow: "var(--a-shadow-md)" }}
              role="status"
            >
              <p style={{ color: "var(--a-mute)" }}>{longLabel(labels[hover] ?? "")}</p>
              <ul className="mt-1 space-y-0.5">
                {series.map((s, si) => (
                  <li key={s.label} className="flex items-center gap-2">
                    <span className="h-0.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: SERIES_COLOR(s.slot ?? si + 1) }} aria-hidden />
                    <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{formatValue(s.values[hover] ?? 0, unit)}</span>
                    {series.length > 1 && <span className="ml-auto truncate pl-2" style={{ color: "var(--a-mute)" }}>{s.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

// --- Invoer ------------------------------------------------------------------

/** Knop die ter plekke om een korte invoer vraagt, in plaats van een browservenster. */
export function InlineAsk({
  label,
  question,
  initial = "",
  placeholder,
  required = false,
  submitLabel = "Opslaan",
  inputMode,
  buttonClassName = "a-button text-xs",
  onSubmit,
}: {
  label: ReactNode;
  question: string;
  initial?: string;
  placeholder?: string;
  required?: boolean;
  submitLabel?: string;
  inputMode?: "text" | "decimal" | "numeric";
  buttonClassName?: string;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className={buttonClassName} onClick={() => { setValue(initial); setOpen(true); }}>
        {label}
      </button>
    );
  }
  return (
    <form
      className="inline-flex max-w-full flex-wrap items-center justify-end gap-1.5 text-left"
      onSubmit={async (e) => {
        e.preventDefault();
        if (required && !value.trim()) return;
        setBusy(true);
        try {
          await onSubmit(value.trim());
          setOpen(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? question}
        aria-label={question}
        title={question}
        {...(inputMode ? { inputMode } : {})}
        className="a-input !w-44 !py-1 text-[0.8125rem]"
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      <button type="submit" className="a-button a-button-primary text-xs" disabled={busy || (required && !value.trim())}>{busy ? "Bezig…" : submitLabel}</button>
      <button type="button" className="a-button text-xs" onClick={() => setOpen(false)}>Annuleren</button>
    </form>
  );
}

// --- Tabel -------------------------------------------------------------------

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Op de telefoon weglaten als er te weinig ruimte is. */
  hideOnMobile?: boolean;
  /** Standaard sorteerbaar zodra rijen een sorteerwaarde hebben. */
  sortable?: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, ReactNode>;
  /** Waarden om op te sorteren per kolom. */
  sort?: Record<string, string | number | null>;
  /** Tekst waarop de zoekbalk zoekt. */
  search?: string;
  /** Waarden voor de filters. */
  filters?: Record<string, string>;
  href?: string;
  /** Waarden voor de CSV. Valt terug op de sorteerwaarden. */
  csv?: Record<string, string | number | null>;
}

export interface TableFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Als knoppenrij met aantallen in plaats van een keuzelijst. */
  chips?: boolean;
}

/** Zorgt dat een cel in Excel niet als formule wordt uitgevoerd. */
function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable({
  columns,
  rows,
  filters = [],
  searchPlaceholder,
  pageSize = 25,
  csvName,
  emptyText = "Niets gevonden.",
  defaultSort,
  toolbar,
}: {
  columns: TableColumn[];
  rows: TableRow[];
  filters?: TableFilter[];
  searchPlaceholder?: string;
  pageSize?: number;
  /** Bestandsnaam zonder extensie. Zonder naam geen exportknop. */
  csvName?: string;
  emptyText?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  toolbar?: ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (q && !(row.search ?? "").toLowerCase().includes(q)) return false;
      return Object.entries(active).every(([key, value]) => !value || row.filters?.[key] === value);
    });
    if (!sort) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a.sort?.[sort.key] ?? null;
      const bv = b.sort?.[sort.key] ?? null;
      if (av === bv) return 0;
      if (av === null) return 1; // zonder waarde altijd onderaan
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "nl") * dir;
    });
  }, [rows, query, active, sort]);

  useEffect(() => setPage(0), [query, active, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = shown.slice(current * pageSize, (current + 1) * pageSize);

  const countFor = (key: string, value: string) => rows.filter((r) => r.filters?.[key] === value).length;
  const canSort = (col: TableColumn) => col.sortable !== false && rows.some((r) => r.sort?.[col.key] !== undefined);

  const toggleSort = (key: string) =>
    setSort((cur) => (cur?.key === key ? (cur.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));

  const download = () => {
    const header = columns.map((c) => csvCell(c.label)).join(";");
    const lines = shown.map((row) => columns.map((c) => csvCell((row.csv ?? row.sort ?? {})[c.key])).join(";"));
    const blob = new Blob([`﻿${[header, ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, href?: string) => {
    if (!href) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
    router.push(href);
  };

  const showToolbar = searchPlaceholder || filters.length > 0 || csvName || toolbar;

  return (
    <div>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4" style={{ borderBottom: "1px solid var(--a-border)" }}>
          {filters.map((f) =>
            f.chips ? (
              <div key={f.key} role="group" aria-label={f.label} className="a-scroll-x flex max-w-full gap-0.5 overflow-x-auto">
                {[{ value: "", label: "Alle" }, ...f.options].map((opt) => {
                  const on = (active[f.key] ?? "") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setActive((cur) => ({ ...cur, [f.key]: opt.value }))}
                      aria-pressed={on}
                      className="whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
                      style={on ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
                    >
                      {opt.label}
                      <span className="num ml-1.5 text-xs" style={{ color: "var(--a-mute)" }}>{opt.value ? countFor(f.key, opt.value) : rows.length}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <select
                key={f.key}
                aria-label={f.label}
                className="a-input !w-auto !py-1 text-[0.8125rem]"
                value={active[f.key] ?? ""}
                onChange={(e) => setActive((cur) => ({ ...cur, [f.key]: e.target.value }))}
              >
                <option value="">{f.label}: alle</option>
                {f.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            ),
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {toolbar}
            {searchPlaceholder && (
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="a-input !w-52 !py-1 text-[0.8125rem] max-sm:!w-full" />
            )}
            {csvName && (
              <button type="button" onClick={download} className="a-button text-xs" disabled={shown.length === 0}>
                CSV
              </button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[0.8125rem]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--a-border)" }}>
              {columns.map((col) => {
                const sortable = canSort(col);
                const dir = sort?.key === col.key ? sort.dir : null;
                return (
                  <th
                    key={col.key}
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={`whitespace-nowrap px-3 py-2 font-semibold first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 ${col.align === "right" ? "text-right" : "text-left"} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 uppercase tracking-[inherit] transition-colors hover:text-[var(--a-text)]">
                        {col.label}
                        <span aria-hidden className="w-2 text-[10px]">{dir === "asc" ? "↑" : dir === "desc" ? "↓" : ""}</span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm" style={{ color: "var(--a-mute)" }}>
                  {rows.length === 0 ? emptyText : "Geen resultaten met deze filters."}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr key={row.id} onClick={(e) => onRowClick(e, row.href)} className={row.href ? "cursor-pointer" : ""} style={{ borderBottom: "1px solid var(--a-border)" }}>
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2.5 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 ${col.align === "right" ? "num text-right" : ""} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`} style={{ color: "var(--a-dim)" }}>
                    {row.cells[col.key] ?? (col.label ? "—" : null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > pageSize && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-5" style={{ color: "var(--a-mute)" }}>
          <span className="num">{current * pageSize + 1}–{Math.min((current + 1) * pageSize, shown.length)} van {shown.length}</span>
          <span className="flex gap-1.5">
            <button type="button" className="a-button text-xs" disabled={current === 0} onClick={() => setPage(current - 1)}>Vorige</button>
            <button type="button" className="a-button text-xs" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Volgende</button>
          </span>
        </div>
      )}
    </div>
  );
}
