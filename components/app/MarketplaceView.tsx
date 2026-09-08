"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { ShiftMiniMap } from "@/components/app/ShiftMiniMap";
import { ShiftCard, ShiftStatusButton } from "@/components/app/ShiftCard";
import { LocationSheet, type LocFilter } from "@/components/app/LocationSheet";
import { hiddenEmployers } from "@/components/app/ShiftMenu";

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
const DAYPARTS = [
  { k: "morning", l: "Ochtend" },
  { k: "afternoon", l: "Middag" },
  { k: "evening", l: "Avond" },
] as const;

const WD_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];

const KLUS_TYPES = {
  freelance: [
    ["✌️", "ZZP'er bij de opdrachtgever"],
    ["💰", "Eigen tarief bepalen"],
    ["🧾", "Zelf belasting regelen"],
    ["🏖️", "Vakantie/pensioen: nee"],
    ["💸", "Uitbetaling per klus"],
  ],
  uitzenden: [
    ["📝", "Op contract bij ZekerFlex"],
    ["💰", "Vast uurloon"],
    ["🧾", "Belasting wordt geregeld"],
    ["🏖️", "Vakantie/pensioen: ja"],
    ["💸", "Wekelijks betaald"],
  ],
} as const;

function KlusTypeExplainer() {
  const Column = ({
    label,
    rows,
    tone,
  }: {
    label: string;
    rows: readonly (readonly [string, string])[];
    tone: "freelance" | "uitzenden";
  }) => (
    <div className="rounded-xl border border-hair bg-paper-soft/50 p-3.5">
      <span
        className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${
          tone === "freelance"
            ? "border-brand-500/40 bg-brand-50 text-brand-700"
            : "border-violet-300 bg-violet-50 text-violet-700"
        }`}
      >
        {label}
      </span>
      <ul className="mt-3 space-y-2">
        {rows.map(([emoji, text]) => (
          <li key={text} className="flex items-start gap-2.5 text-sm text-neutralx-700">
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
          Ontdek welk type klus het beste bij je past
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Column label="Freelance" rows={KLUS_TYPES.freelance} tone="freelance" />
        <Column label="Uitzenden" rows={KLUS_TYPES.uitzenden} tone="uitzenden" />
      </div>
    </details>
  );
}
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isTomorrow(d: Date): boolean {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return dayKey(d) === dayKey(t);
}
function isUpcomingWeekend(d: Date): boolean {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
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
}: {
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
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<Sort>(home ? "match" : "soonest");
  const [q, setQ] = useState(initialQuery);
  const [minRate, setMinRate] = useState<number>(defaultMinRateCents ? Math.round(defaultMinRateCents / 100) : 0);
  const [dayparts, setDayparts] = useState<Set<string>>(new Set());
  const [skill, setSkill] = useState("");
  const [quick, setQuick] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [loc, setLoc] = useState<LocFilter | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHidden(hiddenEmployers());
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
    { k: "favorites", l: "❤️ Favoriete opdrachtgevers" },
    { k: "replacement", l: "🔥 Invalklussen" },
    { k: "tomorrow", l: "📅 Klussen voor morgen" },
    { k: "weekend", l: "📅 Aankomend weekend" },
  ] as const;

  const SORTS: { k: Sort; l: string }[] = [
    ...(home ? [{ k: "match" as Sort, l: "Beste match" }] : []),
    { k: "soonest", l: "Eerst" },
    { k: "pay", l: "Best betaald" },
    ...(home ? [{ k: "near" as Sort, l: "Dichtstbij" }] : []),
  ];
  const activeFilters =
    quick.size + dates.size + dayparts.size + (minRate ? 1 : 0) + (skill ? 1 : 0) + (loc ? 1 : 0);
  function clearAll() {
    setQuick(new Set());
    setDates(new Set());
    setDayparts(new Set());
    setMinRate(0);
    setSkill("");
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

  const skills = useMemo(
    () => [...new Set(shifts.map((s) => s.skill).filter(Boolean))] as string[],
    [shifts],
  );

  const filtered = useMemo(() => {
    let out = shifts.filter((s) => {
      if (hidden.has(s.branch)) return false;
      if (q && !`${s.title} ${s.branch} ${s.city}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (minRate && s.hourlyRateCents < minRate * 100) return false;
      if (loc && loc.maxKm < 60 && haversineKm(loc, { lat: s.branchLat, lng: s.branchLng }) > loc.maxKm) return false;
      if (dayparts.size && !dayparts.has(s.daypart)) return false;
      if (skill && s.skill !== skill) return false;
      const d = new Date(s.startsAt);
      if (quick.has("favorites") && s.workedHereBefore <= 0) return false;
      if (quick.has("replacement") && !s.isReplacement) return false;
      if (quick.has("tomorrow") && !isTomorrow(d)) return false;
      if (quick.has("weekend") && !isUpcomingWeekend(d)) return false;
      if (dates.size && !dates.has(dayKey(d))) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "match") return (b.match?.score ?? 0) - (a.match?.score ?? 0);
      if (sort === "pay") return b.hourlyRateCents - a.hourlyRateCents;
      if (sort === "near") return (a.match?.distanceKm ?? 999) - (b.match?.distanceKm ?? 999);
      return a.startsAt < b.startsAt ? -1 : 1;
    });
    return out;
  }, [shifts, q, minRate, loc, dayparts, skill, sort, quick, dates, hidden]);

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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op titel, opdrachtgever of plaats"
          className="mb-2.5 w-full rounded-full border border-hairstrong bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setOpenChip((v) => (v === "all" ? null : "all"))}
            aria-label="Alle filters"
            className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border ${
              activeFilters ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <Chip id="sort" label="Sorteer" active={sort !== (home ? "match" : "soonest")} />
          <Chip id="quick" label="Snelle filters" count={quick.size} />
          <Chip id="times" label="Tijden" count={dayparts.size} />
          <Chip id="rate" label="Uurtarief" active={minRate > 0} />
          <Chip id="days" label="Dagen" count={dates.size} />
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              loc ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            Locatie
            {loc && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] text-white">1</span>}
            <span className="text-[9px]" aria-hidden>▾</span>
          </button>
          {skills.length > 0 && <Chip id="branch" label="Branches" active={Boolean(skill)} />}
          <button
            type="button"
            onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
            disabled={!home}
            className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
              view === "map" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong bg-white text-neutralx-600"
            }`}
          >
            {view === "map" ? "Lijst" : "Kaart"}
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
            {(openChip === "times" || openChip === "all") && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">Tijden</p>}
                <div className="flex flex-wrap gap-2">
                  {DAYPARTS.map((d) => (
                    <button
                      key={d.k}
                      type="button"
                      onClick={() => toggle(setDayparts)(d.k)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${dayparts.has(d.k) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(openChip === "rate" || openChip === "all") && (
              <label className={`flex items-center gap-2 text-xs ${openChip === "all" ? "mt-3" : ""}`}>
                Min. uurtarief
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minRate || ""}
                  onChange={(e) => setMinRate(Number(e.target.value))}
                  className="w-20 rounded-lg border border-hairstrong px-2 py-1"
                />
                €/u
              </label>
            )}
            {openChip === "all" && (
              <button
                type="button"
                onClick={() => setLocOpen(true)}
                className="mt-3 rounded-full border border-hairstrong px-2.5 py-1 text-xs font-medium"
              >
                Locatie & afstand{loc ? ` · ${loc.maxKm >= 60 ? "overal" : `${loc.maxKm} km`}` : ""}
              </button>
            )}
            {skills.length > 0 && (openChip === "branch" || openChip === "all") && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">Branches</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSkill("")} className={`rounded-full border px-2.5 py-1 text-xs ${!skill ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}>Alle</button>
                  {skills.map((sk) => (
                    <button
                      key={sk}
                      type="button"
                      onClick={() => setSkill((v) => (v === sk ? "" : sk))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${skill === sk ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}
                    >
                      {sk}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(openChip === "days" || openChip === "all") && dayOptions.length > 0 && (
              <div className={openChip === "all" ? "mt-3" : ""}>
                {openChip === "all" && <p className="mb-1.5 text-xs font-semibold text-neutralx-500">Dagen</p>}
                <div className="flex flex-wrap gap-1.5">
                  {dayOptions.map(([k, d]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(setDates)(k)}
                      className={`rounded-lg border px-2 py-1 text-[11px] ${dates.has(k) ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-neutralx-600"}`}
                    >
                      {WD_SHORT[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-hair pt-2 text-xs text-neutralx-400">
              <span>{filtered.length} van {shifts.length} klussen</span>
              {activeFilters > 0 && (
                <button type="button" onClick={clearAll} className="font-medium text-brand-600 hover:underline">
                  Wis alle filters
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
          <p className="text-center text-xs text-neutralx-400">Tik op een stip voor de dienst. Kleur = matchkwaliteit.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">Geen klussen die aan je filters voldoen</p>
            <p className="mt-1 text-sm text-neutralx-500">Verruim je filters of stel een job-alert in bij Beschikbaarheid.</p>
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
                href={`/dashboard/klussen/${s.id}`}
                {...(s.isReplacement ? { ribbon: { label: "Vervanging", tone: "amber" as const } } : {})}
                {...(pendingOffer
                  ? {
                      footerOverride: (
                        <ShiftStatusButton
                          label={
                            s.myOffer && s.myOffer.proposedRateCents === s.hourlyRateCents
                              ? "Reactie verstuurd"
                              : "Tegenbod loopt"
                          }
                          hint="in afwachting"
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
