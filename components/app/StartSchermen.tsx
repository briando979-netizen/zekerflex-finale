"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import { ALLE_BRANCHES_ICOON, BRANCHE_OPTIES, type BrancheKeuze } from "@/lib/shifts/branche-keuze";
import type { Zoeklocatie } from "@/lib/worker/zoeklocatie-kern";

interface Hit {
  label: string;
  lat: number;
  lng: number;
  plaats?: string | null;
}

// Vaste donkere kleuren (nachtblauw, turquoise), zodat dit scherm er in het lichte en het donkere thema hetzelfde
// uitziet: het is de start van de app van YoungOnes (20 nov 2026, eigenaar: "precies zoals YoungOnes").
const KOP = "bg-[linear-gradient(160deg,#0A1446_0%,#0E3A62_55%,#0F5566_100%)]";
const RIJ = "flex min-h-[44px] w-full items-center gap-4 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14D9C9]";
const RIJ_AAN = "border-[#14D9C9] bg-[#1C1F26]";
const RIJ_UIT = "border-[#2A2F38] bg-[#1C1F26]";
const TEGEL = "grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-[#262B33] text-2xl leading-none";
const KNOP = "min-h-[56px] w-full rounded-xl bg-[#14D9C9] px-4 text-base font-bold text-[#0B1238] transition hover:brightness-105 disabled:opacity-50";
const KNOP_OMLIJND = "min-h-[56px] w-full rounded-xl border border-white/70 px-4 text-base font-bold text-white transition hover:bg-white/10 disabled:opacity-50";

/**
 * De start van een nieuwe werker als twee volschermstappen, zoals de app van YoungOnes: "Waar wil je klussen doen?"
 * (een plaats zoeken via PDOK, of de huidige locatie van het toestel; nooit vanzelf) en "In welke branches ben je
 * geïnteresseerd?" (rijen met een pictogram). Daarna "Bekijk de klussen" (naar Ontdekken) of "Maak een profiel aan"
 * (naar de stappen bovenaan Ontdekken). De plaats gaat naar /api/me/zoeklocatie, de branches naar /api/me/branches.
 */
export function StartSchermen({ zoeklocatie, brancheKeuze }: { zoeklocatie: Zoeklocatie | null; brancheKeuze: BrancheKeuze | null }) {
  const ft = useFT();
  const t = ft.start;
  const tl = ft.loc;
  const router = useRouter();
  const [stap, setStap] = useState<1 | 2>(zoeklocatie ? 2 : 1);

  // stap 1: de plaats
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [gezocht, setGezocht] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [plek, setPlek] = useState<Zoeklocatie | null>(zoeklocatie);
  const tId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // stap 2: de branches
  const [gekozen, setGekozen] = useState<Set<string>>(new Set(brancheKeuze?.alle ? BRANCHE_OPTIES.map((o) => o.key) : (brancheKeuze?.branches ?? [])));
  const alleGekozen = gekozen.size === BRANCHE_OPTIES.length;
  const [brancheBezig, setBrancheBezig] = useState(false);
  const [brancheFout, setBrancheFout] = useState<string | null>(null);

  useEffect(() => {
    if (tId.current) clearTimeout(tId.current);
    if (q.trim().length < 2) {
      setHits([]);
      setGezocht(false);
      return;
    }
    tId.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const d: unknown = await r.json();
        const lijst = d && typeof d === "object" && Array.isArray((d as { results?: unknown }).results) ? ((d as { results: Hit[] }).results ?? []) : [];
        setHits(lijst);
      } catch {
        setHits([]);
      }
      setGezocht(true);
    }, 300);
  }, [q]);

  async function bewaarPlek(nieuw: Zoeklocatie) {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/me/zoeklocatie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nieuw),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok || !d || typeof d !== "object" || !("zoeklocatie" in d)) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setFout(typeof msg === "string" ? msg : t.saveError);
        return;
      }
      setPlek((d as { zoeklocatie: Zoeklocatie }).zoeklocatie);
      setQ("");
      setHits([]);
      setStap(2);
    } catch {
      setFout(t.saveError);
    } finally {
      setBezig(false);
    }
  }

  // Alleen na een druk op de knop: nooit vanzelf om de locatie vragen. De naam van de plaats komt uit /api/geo/reverse.
  function gebruikHuidige() {
    setFout(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFout(tl.geenSupport);
      return;
    }
    setBezig(true);
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          let label = tl.huidigLabel;
          try {
            const r = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lng}`, { cache: "no-store" });
            const d: unknown = await r.json();
            const plaats = d && typeof d === "object" ? (d as { result?: { plaats?: unknown } | null }).result?.plaats : null;
            if (typeof plaats === "string" && plaats.trim()) label = plaats.trim();
          } catch {
            /* de naam is bijzaak; de coördinaat telt */
          }
          await bewaarPlek({ lat, lng, label });
        },
        (err) => {
          setBezig(false);
          // 1 = PERMISSION_DENIED; verder alles wat mislukt (geen bereik, time-out) is "niet te bepalen"
          setFout(err.code === 1 ? tl.geweigerd : tl.onbeschikbaar);
        },
        { enableHighAccuracy: false, timeout: 8000 },
      );
    } catch {
      setBezig(false);
      setFout(tl.onbeschikbaar);
    }
  }

  function wissel(sleutel: string) {
    setBrancheFout(null);
    setGekozen((vorig) => {
      const volgend = new Set(vorig);
      if (volgend.has(sleutel)) volgend.delete(sleutel);
      else volgend.add(sleutel);
      return volgend;
    });
  }

  async function bewaarBranches(doel: "klussen" | "profiel") {
    if (brancheBezig) return;
    if (gekozen.size === 0) {
      setBrancheFout(t.brancheKies);
      return;
    }
    setBrancheBezig(true);
    setBrancheFout(null);
    try {
      const res = await fetch("/api/me/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alle: alleGekozen, branches: [...gekozen] }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok || !d || typeof d !== "object" || !("keuze" in d)) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setBrancheFout(typeof msg === "string" ? msg : t.saveError);
        setBrancheBezig(false);
        return;
      }
      // "Maak een profiel aan": naar de stappen bovenaan Ontdekken (de kaart heeft die kop als anker)
      router.push(doel === "profiel" ? "/dashboard/klussen#werker-start-titel" : "/dashboard/klussen");
    } catch {
      setBrancheFout(t.saveError);
      setBrancheBezig(false);
    }
  }

  const voortgang = vulIn(t.stapVan, { n: stap, totaal: 2 });

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#121418] text-white">
      <div className={`${KOP} px-5 pb-10 pt-6`}>
        <div className="flex items-center gap-4">
          {stap === 2 && (
            <button type="button" onClick={() => setStap(1)} aria-label={t.terugKnop} className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/15 text-2xl leading-none text-white">
              <span aria-hidden>‹</span>
            </button>
          )}
          <div className="flex gap-2" role="progressbar" aria-label={voortgang} aria-valuenow={stap} aria-valuemin={1} aria-valuemax={2}>
            <span className={`h-1.5 w-16 rounded-full ${stap === 1 ? "bg-[#14D9C9]" : "bg-white/30"}`} aria-hidden />
            <span className={`h-1.5 w-16 rounded-full ${stap === 2 ? "bg-[#14D9C9]" : "bg-white/30"}`} aria-hidden />
          </div>
        </div>
        <h1 className="mt-10 font-display text-3xl font-extrabold leading-tight">{stap === 1 ? tl.titel : t.brancheTitel}</h1>
      </div>

      {stap === 1 ? (
        <div className="flex flex-1 flex-col px-5 py-6">
          <p className="text-base leading-snug text-white/85">{t.locatieUitleg}</p>
          <label htmlFor="start-plaats" className="sr-only">
            {tl.zoekLabel}
          </label>
          <div className="relative mt-5">
            <input
              id="start-plaats"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tl.zoekPlaceholder}
              autoComplete="off"
              className="min-h-[56px] w-full rounded-xl border border-[#2A2F38] bg-[#1C1F26] px-4 pr-12 text-base text-white outline-none placeholder:text-white/50 focus:border-[#14D9C9]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          {hits.length > 0 && (
            <ul className="mt-2 divide-y divide-[#2A2F38]">
              {hits.map((h, i) => (
                <li key={`${h.lat},${h.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => void bewaarPlek({ lat: h.lat, lng: h.lng, label: h.plaats?.trim() || h.label })}
                    disabled={bezig}
                    className="flex min-h-[56px] w-full items-center gap-4 py-2 text-left"
                  >
                    <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg bg-[#1C1F26] text-white/80" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" stroke="currentColor" strokeWidth="2" />
                        <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold">{h.plaats?.trim() || h.label}</span>
                      {h.plaats && h.plaats.trim() !== h.label && <span className="block truncate text-sm text-white/60">{h.label}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {gezocht && hits.length === 0 && q.trim().length >= 2 && <p className="mt-2 text-sm text-white/60">{tl.geenResultaat}</p>}

          <div className="my-6 flex items-center gap-3 text-sm text-white/60" aria-hidden>
            <span className="h-px flex-1 bg-white/15" />
            {tl.of}
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <button type="button" onClick={gebruikHuidige} disabled={bezig} className={KNOP}>
            {bezig ? tl.bepalen : tl.huidige}
          </button>
          {fout && (
            <p role="alert" className="mt-3 rounded-lg border border-[#F5C451] bg-[#FFF6DC] px-3 py-2 text-sm text-[#0B1238]">
              {fout}
            </p>
          )}
          {plek && (
            <button type="button" onClick={() => setStap(2)} className={`${KNOP_OMLIJND} mt-3`}>
              {vulIn(t.locatieVerder, { plaats: plek.label })}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col px-5 py-6">
          <div className="grid gap-2" role="group" aria-label={t.brancheStep}>
            <button type="button" aria-pressed={alleGekozen} onClick={() => setGekozen(alleGekozen ? new Set() : new Set(BRANCHE_OPTIES.map((o) => o.key)))} className={`${RIJ} ${alleGekozen ? RIJ_AAN : RIJ_UIT}`}>
              <span className={TEGEL} aria-hidden>{ALLE_BRANCHES_ICOON}</span>
              <span className="flex-1 text-base font-semibold">{t.alleBranches}</span>
              {alleGekozen && <span className="text-[#14D9C9]" aria-hidden>✓</span>}
            </button>
            {BRANCHE_OPTIES.map((o) => {
              const aan = gekozen.has(o.key);
              return (
                <button key={o.key} type="button" aria-pressed={aan} onClick={() => wissel(o.key)} className={`${RIJ} ${aan ? RIJ_AAN : RIJ_UIT}`}>
                  <span className={TEGEL} aria-hidden>{o.icoon}</span>
                  <span className="flex-1 text-base font-semibold">{ft.cat[o.key] ?? o.label}</span>
                  {aan && <span className="text-[#14D9C9]" aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
          {brancheFout && (
            <p role="alert" className="mt-3 rounded-lg border border-[#F5C451] bg-[#FFF6DC] px-3 py-2 text-sm text-[#0B1238]">
              {brancheFout}
            </p>
          )}
          <div className="sticky bottom-0 -mx-5 mt-6 space-y-3 bg-[#121418]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button type="button" onClick={() => void bewaarBranches("klussen")} disabled={brancheBezig} className={KNOP}>
              {brancheBezig ? t.saving : t.brancheBekijk}
            </button>
            <button type="button" onClick={() => void bewaarBranches("profiel")} disabled={brancheBezig} className={KNOP_OMLIJND}>
              {t.brancheProfielAan}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
