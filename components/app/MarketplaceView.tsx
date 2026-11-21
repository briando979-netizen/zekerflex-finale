"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { SHIFT_CATEGORIES, shiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";
import { ShiftMiniMap } from "@/components/app/ShiftMiniMap";
import { ShiftCard, ShiftStatusButton } from "@/components/app/ShiftCard";
import { LocationSheet, type LocFilter } from "@/components/app/LocationSheet";
import { hiddenEmployers } from "@/components/app/ShiftMenu";
import { useFT } from "@/components/i18n/useFT";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { SAVED_EVENT, deviceStore, readSaved } from "@/lib/shifts/bewaard";
import { echteKlussenEerst } from "@/lib/shifts/testklus";
import { KLUS_TYPE_EMOJI } from "@/lib/shifts/klus-type";
import { ALLE_BRANCHES_ICOON, brancheIcoon } from "@/lib/shifts/branche-keuze";

type Sort = "match" | "soonest" | "pay" | "near";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const TYPE_EMOJI = KLUS_TYPE_EMOJI;
/** Type klus in het filter (zoals YoungOnes, 21 nov): beide staan standaard aan */
type KlusType = "freelance" | "uitzend";
const ALLE_TYPEN: readonly KlusType[] = ["freelance", "uitzend"];

function KlusTypeExplainer() {
  const t = useFT();
  const zip = (emoji: readonly string[], texts: readonly string[]) => texts.map((text, i) => [emoji[i] ?? "•", text] as const);
  const Column = ({
    label,
    rows,
    tone,
  }: {
    label: string;
    rows: readonly (readonly [string, string])[];
    tone: "freelance" | "uitzenden";
  }) => (
    <div className="min-w-0 rounded-xl border border-hair bg-paper-soft/50 p-2.5 sm:p-3.5">
      <span
        className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${
          tone === "freelance"
            ? "border-brand-500/40 bg-brand-50 text-brand-700"
            : "border-violet-300 bg-violet-50 text-violet-700"
        }`}
      >
        {label}
      </span>
      <ul className="mt-2.5 space-y-1.5 sm:mt-3 sm:space-y-2">
        {rows.map(([emoji, text]) => (
          <li key={text} className="flex items-start gap-1.5 text-xs text-neutralx-700 sm:gap-2.5 sm:text-sm">
            <span aria-hidden>{emoji}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <details className="group mb-5 rounded-xl border border-hair bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-ink">
        <span className="underline decoration-crit/50 decoration-2 underline-offset-4">
          {t.market.typeTitle}
        </span>
        <svg
          className="flex-shrink-0 text-neutralx-400 transition group-open:rotate-180"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {/* 21 nov (eigenaar): Freelance en Uitzenden naast elkaar, ook op de telefoon */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        <Column label={t.market.freelanceLabel} rows={zip(TYPE_EMOJI.freelance, t.market.typeFreelance)} tone="freelance" />
        <Column label={t.market.uitzendLabel} rows={zip(TYPE_EMOJI.uitzenden, t.market.typeUitzend)} tone="uitzenden" />
      </div>
    </details>
  );
}
/** Een rij met een vinkje in het filter (Type klus, branches), zoals in de app van YoungOnes. */
function VinkRij({ label, aan, onClick, icoon, rechts }: { label: string; aan: boolean; onClick: () => void; icoon?: string; rechts?: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={aan}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${aan ? "border-brand-500" : "border-hairstrong"}`}
    >
      <span aria-hidden className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border ${aan ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white"}`}>
        {aan && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {icoon && <span aria-hidden>{icoon}</span>}
      <span className="min-w-0 flex-1 font-medium text-ink">{label}</span>
      {rechts}
    </button>
  );
}

// Days in Dutch time: the list is rendered on the UTC server first, and a shift
// at 00:30 belongs to the Dutch day whatever zone the phone is in.
const dayKey = (d: Date) => amsterdamDayKey(d);

function isTomorrow(d: Date): boolean {
  const p = amsterdamParts(new Date());
  return dayKey(d) === new Date(Date.UTC(p.year, p.month - 1, p.day + 1)).toISOString().slice(0, 10);
}
function isUpcomingWeekend(d: Date): boolean {
  const day = amsterdamParts(d).weekday; // 0 = Sun, 6 = Sat
  if (day !== 0 && day !== 6) return false;
  const diff = (d.getTime() - Date.now()) / 86_400_000;
  return diff >= -0.5 && diff <= 8;
}

export function MarketplaceView({
  shifts,
  home,
  homeLabel = null,
  initialQuery = "",
  canApply,
  blockReason = null,
  defaultMinRateCents,
  defaultMaxTravel,
  defaultBranches = [],
  leeg,
}: {
  /** de branches die de werker bij de start koos: het filter staat er standaard op (en kan weg) */
  defaultBranches?: ShiftCategoryKey[];
  /**
   * Zonder één klus: wat er in het vak staat, met één knop. De filterbalk met het zoekveld blijft dan gewoon staan
   * (zoals bij YoungOnes; 21 nov: het vergrootglas in de balk springt naar #zoeken en deed anders niets).
   */
  leeg?: { titel: string; tekst: string; knop: string; href: string };
  shifts: MarketplaceShift[];
  home: { lat: number; lng: number } | null;
  homeLabel?: string | null;
  initialQuery?: string;
  canApply: boolean;
  /** why applying is blocked (verification pending, …) — shown as a hint on each card */
  blockReason?: string | null;
  defaultMinRateCents: number | null;
  defaultMaxTravel: number | null;
}) {
  void canApply;
  void blockReason;
  void defaultMaxTravel;
  const t = useFT();
  const mk = t.market;
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<Sort>(home ? "match" : "soonest");
  const [q, setQ] = useState(initialQuery);
  const [minRate, setMinRate] = useState<number>(defaultMinRateCents ? Math.round(defaultMinRateCents / 100) : 0);
  // "Tijden" (ochtend/middag/avond) staat sinds 21 nov niet meer in het filter (eigenaar: "haal tijden weg in de filter")
  const [typen, setTypen] = useState<Set<KlusType>>(new Set(ALLE_TYPEN));
  // Branches (sectors) — multi-select over the full list, not just what happens to be on screen.
  const [branches, setBranches] = useState<Set<ShiftCategoryKey>>(new Set(defaultBranches));
  const [quick, setQuick] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [loc, setLoc] = useState<LocFilter | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // klussen bewaard met het hartje (op dit apparaat); volgt het hartje meteen
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHidden(hiddenEmployers());
  }, []);

  useEffect(() => {
    const load = () => setSaved(readSaved(deviceStore()));
    load();
    window.addEventListener(SAVED_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(SAVED_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const toggle = (setter: typeof setQuick) => (key: string) =>
    setter((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const dayOptions = useMemo(() => {
    const seen = new Map<string, Date>();
    for (const s of shifts) {
      const d = new Date(s.startsAt);
      const k = dayKey(d);
      if (!seen.has(k)) seen.set(k, d);
    }
    return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 21);
  }, [shifts]);

  const QUICK = [
    { k: "saved", l: mk.qSaved },
    { k: "favorites", l: mk.qFavorites },
    { k: "replacement", l: mk.qReplacement },
    { k: "tomorrow", l: mk.qTomorrow },
    { k: "weekend", l: mk.qWeekend },
    { k: "free", l: mk.qFree },
  ] as const;

  const SORTS: { k: Sort; l: string }[] = [
    ...(home ? [{ k: "match" as Sort, l: mk.sortMatch }] : []),
    { k: "soonest", l: mk.sortSoonest },
    { k: "pay", l: mk.sortPay },
    ...(home ? [{ k: "near" as Sort, l: mk.sortNear }] : []),
  ];
  const activeFilters =
    quick.size + dates.size + (typen.size < ALLE_TYPEN.length ? 1 : 0) + (minRate ? 1 : 0) + (branches.size ? 1 : 0) + (loc ? 1 : 0);
  function clearAll() {
    setQuick(new Set());
    setDates(new Set());
    setTypen(new Set(ALLE_TYPEN));
    setMinRate(0);
    setBranches(new Set());
    setLoc(null);
    setQ("");
  }

  // mark the marketplace as seen (clears the "nieuw" badge next visit)
  useEffect(() => {
    fetch("/api/me/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplaceSeenAt: new Date().toISOString() }),
    }).catch(() => undefined);
  }, []);

  const categoryOf = useMemo(() => new Map(shifts.map((s) => [s.id, shiftCategory(s.title, s.skill).key])), [shifts]);
  const branchCounts = useMemo(() => {
    const c = new Map<ShiftCategoryKey, number>();
    for (const k of categoryOf.values()) c.set(k, (c.get(k) ?? 0) + 1);
    return c;
  }, [categoryOf]);

  const filtered = useMemo(() => {
    let out = shifts.filter((s) => {
      if (hidden.has(s.branch)) return false;
      if (q && !`${s.title} ${s.company} ${s.branch} ${s.city}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (minRate && s.hourlyRateCents < minRate * 100) return false;
      if (loc && loc.maxKm < 60 && haversineKm(loc, { lat: s.branchLat, lng: s.branchLng }) > loc.maxKm) return false;
      if (!typen.has(s.viaUitzendbureau || s.uitzendPartner ? "uitzend" : "freelance")) return false;
      if (branches.size && !branches.has(categoryOf.get(s.id) ?? "algemeen")) return false;
      const d = new Date(s.startsAt);
      // Favorieten: bedrijven die je volgt (❤️) of waar je al eerder werkte.
      if (quick.has("favorites") && s.workedHereBefore <= 0 && !s.followed && !s.favorietBijBedrijf) return false;
      if (quick.has("saved") && !saved.has(s.id)) return false;
      if (quick.has("replacement") && !s.isReplacement) return false;
      if (quick.has("tomorrow") && !isTomorrow(d)) return false;
      if (quick.has("weekend") && !isUpcomingWeekend(d)) return false;
      if (quick.has("free") && s.busy) return false; // overlaps own work (lib/shifts/worker-overlap)
      if (dates.size && !dates.has(dayKey(d))) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      // Echte klussen altijd boven testklussen (geen werk achter), daarna de eigen klus-alerts
      // ("verschijnt bovenaan"), dan de gekozen volgorde.
      const echt = echteKlussenEerst(a, b);
      if (echt !== 0) return echt;
      if (Boolean(a.alert) !== Boolean(b.alert)) return a.alert ? -1 : 1;
      if (sort === "match") return (b.match?.score ?? 0) - (a.match?.score ?? 0);
      if (sort === "pay") return b.hourlyRateCents - a.hourlyRateCents;
      if (sort === "near") return (a.match?.distanceKm ?? 999) - (b.match?.distanceKm ?? 999);
      return a.startsAt < b.startsAt ? -1 : 1;
    });
    return out;
  }, [shifts, q, minRate, loc, typen, branches, categoryOf, sort, quick, dates, hidden, saved]);
  const savedCount = useMemo(() => shifts.filter((s) => saved.has(s.id)).length, [shifts, saved]);

  const Chip = ({ id, label, count, active }: { id: string; label: string; count?: number; active?: boolean }) => {
    const on = openChip === id || Boolean(count) || active;
    return (
      <button
        type="button"
        onClick={() => setOpenChip((v) => (v === id ? null : id))}
        className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
        }`}
      >
        {label}
        {count ? <span className="rounded-full bg-brand-500 px-1.5 text-[10px] text-white">{count}</span> : null}
        <span className={`text-[9px] transition ${openChip === id ? "rotate-180" : ""}`} aria-hidden>▼</span>
      </button>
    );
  };

  return (
    <div>
      {/* filter chips */}
      <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-hair bg-paper-soft/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <input
          id="zoeken"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mk.search}
          aria-label={mk.search}
          className="mb-2.5 w-full rounded-full border border-hairstrong bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setOpenChip((v) => (v === "all" ? null : "all"))}
            aria-label={mk.allFilters}
            className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border ${
              activeFilters ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {/* sorteren als icoonknop naast de filters, dan Snelle filters · Dagen · Locatie: de balk van YoungOnes (20 nov) */}
          <button
            type="button"
            onClick={() => setOpenChip((v) => (v === "sort" ? null : "sort"))}
            aria-label={mk.sort}
            title={mk.sort}
            aria-expanded={openChip === "sort"}
            className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border ${
              sort !== (home ? "match" : "soonest") || openChip === "sort" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h10M4 12h7M4 17h4M17 6v12m0 0-3-3m3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Chip id="quick" label={mk.quick} count={quick.size} />
          <Chip id="days" label={mk.days} count={dates.size} />
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              loc ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            {mk.location}
            {loc && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] text-white">1</span>}
            <span className="text-[9px]" aria-hidden>▾</span>
          </button>
          <Chip id="branch" label={mk.branches} count={branches.size} />
          <Chip id="type" label={mk.filterTypeKop} active={typen.size < ALLE_TYPEN.length} />
          <Chip id="rate" label={mk.rate} active={minRate > 0} />
          {(savedCount > 0 || quick.has("saved")) && (
            <button
              type="button"
              onClick={() => toggle(setQuick)("saved")}
              aria-pressed={quick.has("saved")}
              className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quick.has("saved") ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-crit" aria-hidden>
                <path d="M12 20s-7-4.4-9.2-8.5C1.3 8.7 2.8 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.2 0 4.7 3.2 3.2 6C19 15.6 12 20 12 20Z" />
              </svg>
              {mk.saved}
              <span className="rounded-full bg-brand-500 px-1.5 text-[10px] text-white">{savedCount}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
            disabled={!home}
            className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
              view === "map" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            {view === "map" ? mk.list : mk.map}
          </button>
        </div>

        {openChip && (
          <div className="mt-3 rounded-xl border border-hair bg-white p-3 text-sm">
            {(openChip === "sort") && (
              <div className="flex flex-wrap gap-2">
                {SORTS.map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => { setSort(o.k); setOpenChip(null); }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${sort === o.k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            )}
            {(openChip === "quick" || openChip === "all") && (
              <div className="flex flex-wrap gap-2">
                {QUICK.map((f) => (
                  <button
                    key={f.k}
                    type="button"
                    onClick={() => toggle(setQuick)(f.k)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${quick.has(f.k) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            )}
            {(openChip === "type" || openChip === "all") && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">{mk.filterTypeKop}</p>}
                <div className="space-y-2">
                  {ALLE_TYPEN.map((k) => (
                    <VinkRij
                      key={k}
                      label={k === "freelance" ? mk.filterFreelance : mk.filterUitzend}
                      aan={typen.has(k)}
                      onClick={() =>
                        setTypen((prev) => {
                          const n = new Set(prev);
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          // minstens één type: anders zie je niets
                          return n.size === 0 ? prev : n;
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {(openChip === "rate" || openChip === "all") && (
              <label className={`flex items-center gap-2 text-xs ${openChip === "all" ? "mt-3" : ""}`}>
                {mk.minRate}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minRate || ""}
                  onChange={(e) => setMinRate(Number(e.target.value))}
                  className="w-20 rounded-lg border border-hairstrong px-2 py-1"
                />
                {mk.perHourUnit}
              </label>
            )}
            {openChip === "all" && (
              <button
                type="button"
                onClick={() => setLocOpen(true)}
                className="mt-3 rounded-full border border-hairstrong px-2.5 py-1 text-xs font-medium"
              >
                {mk.locationDistance}{loc ? ` · ${loc.maxKm >= 60 ? mk.everywhere : `${loc.maxKm} km`}` : ""}
              </button>
            )}
            {(openChip === "branch" || openChip === "all") && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">{mk.branches}</p>}
                {/* zoals YoungOnes: "Alle branches" bovenaan, dan elke branche met een vinkje; alles staat standaard aan.
                    Intern betekent een lege lijst "alle branches". */}
                <div className="space-y-2">
                  <VinkRij icoon={ALLE_BRANCHES_ICOON} label={t.start.alleBranches} aan={branches.size === 0} onClick={() => setBranches(new Set())} />
                  {SHIFT_CATEGORIES.map((c) => (
                    <VinkRij
                      key={c.key}
                      icoon={brancheIcoon(c.key)}
                      label={c.key === "algemeen" ? t.cat.overig : t.cat[c.key]}
                      aan={branches.size === 0 || branches.has(c.key)}
                      rechts={<span className="text-xs text-neutralx-400">{branchCounts.get(c.key) ?? 0}</span>}
                      onClick={() =>
                        setBranches((prev) => {
                          const alle = SHIFT_CATEGORIES.map((x) => x.key);
                          const next = new Set(prev.size === 0 ? alle : prev);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next.size === 0 || next.size === alle.length ? new Set<ShiftCategoryKey>() : next;
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {(openChip === "days" || openChip === "all") && dayOptions.length > 0 && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">{mk.days}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {dayOptions.map(([k, d]) => {
                    const p = amsterdamParts(d);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggle(setDates)(k)}
                        className={`rounded-lg border px-2 py-1 text-[11px] ${dates.has(k) ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-neutralx-600"}`}
                      >
                        {t.date.wd[p.weekday]} {p.day}/{p.month}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-hair pt-2 text-xs text-neutralx-400">
              <span>{mk.nOfM(filtered.length, shifts.length)}</span>
              {activeFilters > 0 && (
                <button type="button" onClick={clearAll} className="font-medium text-brand-600 hover:underline">
                  {mk.clearAll}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Type-klus vergelijking — onder de filterbalk */}
      <KlusTypeExplainer />

      {view === "map" && home ? (
        <div className="space-y-4">
          <ShiftMiniMap
            home={home}
            height={380}
            points={filtered.map((s) => ({ id: s.id, lat: s.branchLat, lng: s.branchLng, score: s.match?.score ?? 0.5, label: s.title, km: s.match?.distanceKm ?? 0 }))}
          />
          <p className="text-center text-xs text-neutralx-400">{mk.mapHint}</p>
        </div>
      ) : shifts.length === 0 && leeg ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">{leeg.titel}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">{leeg.tekst}</p>
            <Link href={leeg.href} className="btn-primary mt-4 inline-flex">
              {leeg.knop}
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">{mk.emptyTitle}</p>
            <p className="mt-1 text-sm text-neutralx-500">{mk.emptyBody}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((s) => {
            const pendingOffer = s.myOffer?.status === "pending";
            return (
              <ShiftCard
                key={s.id}
                shift={s}
                t={t}
                href={`/dashboard/klussen/${s.id}`}
                dim={Boolean(s.busy)}
                {...(s.isReplacement ? { ribbon: { label: mk.replacement, tone: "amber" as const } } : {})}
                {...(pendingOffer
                  ? {
                      footerOverride: (
                        <ShiftStatusButton
                          label={
                            s.myOffer && s.myOffer.proposedRateCents === s.hourlyRateCents
                              ? t.card.responseSent
                              : mk.counterRunning
                          }
                          hint={mk.waiting}
                          tone="warn"
                        />
                      ),
                    }
                  : {})}
              />
            );
          })}
        </div>
      )}

      <LocationSheet
        open={locOpen}
        onClose={() => setLocOpen(false)}
        home={home}
        homeLabel={homeLabel}
        value={loc}
        onApply={(v) => {
          setLoc(v);
          setLocOpen(false);
        }}
      />
    </div>
  );
}
