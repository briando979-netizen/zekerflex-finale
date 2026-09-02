"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { ApplyButton } from "@/components/app/ApplyButton";
import { ShiftMiniMap } from "@/components/app/ShiftMiniMap";
import { ShiftCard, ShiftStatusButton } from "@/components/app/ShiftCard";

type Sort = "match" | "soonest" | "pay" | "near";
const DAYPARTS = [
  { k: "morning", l: "Ochtend" },
  { k: "afternoon", l: "Middag" },
  { k: "evening", l: "Avond" },
] as const;

export function MarketplaceView({
  shifts,
  home,
  canApply,
  defaultMinRateCents,
  defaultMaxTravel,
}: {
  shifts: MarketplaceShift[];
  home: { lat: number; lng: number } | null;
  canApply: boolean;
  defaultMinRateCents: number | null;
  defaultMaxTravel: number | null;
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<Sort>(home ? "match" : "soonest");
  const [q, setQ] = useState("");
  const [minRate, setMinRate] = useState<number>(defaultMinRateCents ? Math.round(defaultMinRateCents / 100) : 0);
  const [maxTravel, setMaxTravel] = useState<number>(defaultMaxTravel ?? 90);
  const [dayparts, setDayparts] = useState<Set<string>>(new Set());
  const [skill, setSkill] = useState("");

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
      if (q && !`${s.title} ${s.branch} ${s.city}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (minRate && s.hourlyRateCents < minRate * 100) return false;
      if (s.match && maxTravel < 90 && s.match.travelMinutes > maxTravel) return false;
      if (dayparts.size && !dayparts.has(s.daypart)) return false;
      if (skill && s.skill !== skill) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "match") return (b.match?.score ?? 0) - (a.match?.score ?? 0);
      if (sort === "pay") return b.hourlyRateCents - a.hourlyRateCents;
      if (sort === "near") return (a.match?.distanceKm ?? 999) - (b.match?.distanceKm ?? 999);
      return a.startsAt < b.startsAt ? -1 : 1;
    });
    return out;
  }, [shifts, q, minRate, maxTravel, dayparts, skill, sort]);

  return (
    <div>
      {/* filter bar */}
      <div className="card sticky top-[4.5rem] z-10 mb-5 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek op titel, vestiging of plaats"
            className="min-w-[12rem] flex-1 rounded-lg border border-hairstrong px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-hairstrong px-2 py-1.5 text-sm">
            {home && <option value="match">Beste match</option>}
            <option value="soonest">Eerst</option>
            <option value="pay">Best betaald</option>
            {home && <option value="near">Dichtstbij</option>}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-hairstrong text-sm">
            <button type="button" onClick={() => setView("list")} className={`px-3 py-1.5 ${view === "list" ? "bg-brand-500 text-white" : "text-neutralx-600"}`}>Lijst</button>
            <button type="button" onClick={() => setView("map")} disabled={!home} className={`px-3 py-1.5 ${view === "map" ? "bg-brand-500 text-white" : "text-neutralx-600"} disabled:opacity-40`}>Kaart</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutralx-600">
          <label className="flex items-center gap-2">
            min. tarief
            <input type="number" min={0} step={1} value={minRate || ""} onChange={(e) => setMinRate(Number(e.target.value))} className="w-16 rounded border border-hairstrong px-1.5 py-1" />
            €/u
          </label>
          {home && (
            <label className="flex items-center gap-2">
              max. reistijd
              <input type="range" min={10} max={90} value={maxTravel} onChange={(e) => setMaxTravel(Number(e.target.value))} className="accent-brand-500" />
              <span className="num w-12">{maxTravel === 90 ? "alles" : `${maxTravel}m`}</span>
            </label>
          )}
          <span className="flex items-center gap-1">
            {DAYPARTS.map((d) => (
              <button
                key={d.k}
                type="button"
                onClick={() =>
                  setDayparts((prev) => {
                    const n = new Set(prev);
                    n.has(d.k) ? n.delete(d.k) : n.add(d.k);
                    return n;
                  })
                }
                className={`rounded-full border px-2 py-0.5 ${dayparts.has(d.k) ? "border-brand-500 bg-brand-50 text-brand-600" : "border-hairstrong"}`}
              >
                {d.l}
              </button>
            ))}
          </span>
          {skills.length > 0 && (
            <select value={skill} onChange={(e) => setSkill(e.target.value)} className="rounded border border-hairstrong px-1.5 py-1">
              <option value="">alle vakken</option>
              {skills.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <span className="ml-auto text-neutralx-400">{filtered.length} van {shifts.length}</span>
        </div>
      </div>

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                        <ShiftStatusButton label="Tegenbod loopt" hint="in afwachting" tone="warn" />
                      ),
                    }
                  : { action: <ApplyButton shiftId={s.id} disabled={!canApply} /> })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
