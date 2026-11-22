"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import { ALLE_BRANCHES_ICOON, BRANCHE_OPTIES, type BrancheKeuze } from "@/lib/shifts/branche-keuze";
import type { Zoeklocatie } from "@/lib/worker/zoeklocatie-kern";
import { POORT_STAPPEN } from "@/lib/onboarding/werker-poort";
import { kvkAntwoordVan, nlPostcode, werkvormNaAntwoord, WERKVORMEN_MET_KVK, type KvkAntwoord, type Werkvorm } from "@/lib/onboarding/kvk-vraag";

interface Hit {
  label: string;
  lat: number;
  lng: number;
  plaats?: string | null;
  postcode?: string | null;
}

/** De schermen van de start: 1 plaats, 2 werkvorm ("Heb je een KVK-nummer?"), 3 branches. */
type Scherm = 1 | 2 | 3;

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
 * De start van een nieuwe werker als volschermstappen, zoals de app van YoungOnes: "Waar wil je klussen doen?" (een
 * postcode of plaats zoeken via PDOK, of de huidige locatie van het toestel; nooit vanzelf), "Heb je een KVK-nummer?" (de
 * werkvorm, 22 nov 2026) en "In welke branches ben je geïnteresseerd?" (rijen met een pictogram). Daarna "Verder" (naar je
 * gegevens) of "Bekijk de klussen" (naar Ontdekken). De plaats gaat naar /api/me/zoeklocatie, de werkvorm naar
 * /api/me/richting, de branches naar /api/me/branches. Typt de werker zijn postcode, dan bewaren we die meteen ook als
 * thuisbasis: dan vraagt "Je gegevens" hem niet nog eens (22 nov 2026, gebruikersonderzoek punt 6).
 * De voortgang is dezelfde balk van vijf stappen als in de rest van de aanmelding (POORT_STAPPEN): plaats en werkvorm
 * horen bij stap 1 (richting), de branches zijn stap 2; "Je gegevens" gaat verder met stap 3.
 */
export function StartSchermen({
  zoeklocatie,
  brancheKeuze,
  workerKind = null,
}: {
  zoeklocatie: Zoeklocatie | null;
  brancheKeuze: BrancheKeuze | null;
  /** de werkvorm als die al gekozen is (dan begint de start bij de branches) */
  workerKind?: Werkvorm | null;
}) {
  const ft = useFT();
  const t = ft.start;
  const tl = ft.loc;
  const router = useRouter();
  const [stap, setStap] = useState<Scherm>(!zoeklocatie ? 1 : !workerKind ? 2 : 3);

  // stap 2: de werkvorm als vraag "Heb je een KVK-nummer?" (de opgeslagen waarden blijven zzp/flexwerker/uitzendkracht)
  const [antwoord, setAntwoord] = useState<KvkAntwoord | null>(kvkAntwoordVan(workerKind));
  const [metKvk, setMetKvk] = useState<Werkvorm | null>(workerKind === "zzp" || workerKind === "flexwerker" ? workerKind : null);
  const [vormBezig, setVormBezig] = useState(false);
  const [vormFout, setVormFout] = useState<string | null>(null);
  const gekozenVorm = werkvormNaAntwoord(antwoord, metKvk);

  // stap 1: de plaats
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [gezocht, setGezocht] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [plek, setPlek] = useState<Zoeklocatie | null>(zoeklocatie);
  const tId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // stap 3: de branches
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

  async function bewaarPlek(nieuw: Zoeklocatie, thuis: { postcode: string; plaats: string | null } | null = null) {
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
      // de werker typte zijn postcode: meteen ook de thuisbasis (zoals "Bewaar en ga later verder" bij Je gegevens), dan
      // vraagt die stap hem niet nog eens. Lukt dat niet, dan vraagt Je gegevens hem gewoon zoals altijd.
      if (thuis) {
        const body = new FormData();
        body.set("identityMethod", "bewaren");
        body.set("postalCode", thuis.postcode);
        if (thuis.plaats) body.set("city", thuis.plaats);
        await fetch("/api/onboarding", { method: "POST", body }).catch(() => null);
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

  /** Een gekozen zoekresultaat is de thuisbasis als de werker precies die postcode typte (geen plaats of los adres). */
  function thuisVan(h: Hit): { postcode: string; plaats: string | null } | null {
    const getypt = nlPostcode(q);
    const gevonden = h.postcode ? nlPostcode(h.postcode) : null;
    return getypt && gevonden === getypt ? { postcode: getypt, plaats: h.plaats?.trim() || null } : null;
  }

  async function bewaarWerkvorm() {
    if (!gekozenVorm || vormBezig) return;
    setVormBezig(true);
    setVormFout(null);
    try {
      const res = await fetch("/api/me/richting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: gekozenVorm }),
      });
      if (!res.ok) {
        const d: unknown = await res.json().catch(() => null);
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setVormFout(typeof msg === "string" ? msg : t.saveError);
        return;
      }
      setStap(3);
    } catch {
      setVormFout(t.saveError);
    } finally {
      setVormBezig(false);
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
      // "Verder": meteen naar Je gegevens (stap 3 van 5), niet eerst naar Ontdekken met een anker (22 nov 2026: daar viel de
      // kaart "Geld verdienen?" half onder de kopbalk, en het was een "begin maar" te veel)
      router.push(doel === "profiel" ? "/dashboard/verificatie" : "/dashboard/klussen");
    } catch {
      setBrancheFout(t.saveError);
      setBrancheBezig(false);
    }
  }

  // één voortgang voor de hele aanmelding (22 nov 2026): de vijf stappen van de poort. Plaats en werkvorm zijn stap 1, de
  // branches stap 2; de stap die bezig is, is turquoise, wat klaar is wit.
  const poortStap = stap === 3 ? 2 : 1;
  const voortgang = vulIn(t.stapVan, { n: poortStap, totaal: POORT_STAPPEN.length });
  const titel = stap === 1 ? tl.titel : stap === 2 ? t.kvkVraag : t.brancheTitel;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#121418] text-white">
      <div className={`${KOP} px-5 pb-10 pt-6`}>
        <div className="flex items-center gap-4">
          {stap > 1 && (
            <button type="button" onClick={() => setStap(stap === 3 ? 2 : 1)} aria-label={t.terugKnop} className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/15 text-2xl leading-none text-white">
              <span aria-hidden>‹</span>
            </button>
          )}
          <div className="flex flex-1 items-center gap-1.5" role="progressbar" aria-label={voortgang} aria-valuenow={poortStap} aria-valuemin={1} aria-valuemax={POORT_STAPPEN.length}>
            {POORT_STAPPEN.map((p, i) => (
              <span key={p.sleutel} className={`h-1.5 flex-1 rounded-full ${i + 1 < poortStap ? "bg-white" : i + 1 === poortStap ? "bg-[#14D9C9]" : "bg-white/25"}`} aria-hidden />
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-white/75">{voortgang}</p>
        <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">{titel}</h1>
      </div>

      {stap === 2 ? (
        <div className="flex flex-1 flex-col px-5 py-6">
          <p className="text-base leading-snug text-white/85">{t.kindHint}</p>
          {/* Ja/Nee als keuzerondjes; bij Ja daaronder de bestaande keuze zzp'er of flexwerker */}
          <div className="mt-5 grid gap-2" role="radiogroup" aria-label={t.kvkVraag}>
            {(["ja", "nee"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={antwoord === a}
                onClick={() => {
                  setVormFout(null);
                  setAntwoord(a);
                }}
                className={`${RIJ} ${antwoord === a ? RIJ_AAN : RIJ_UIT}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{a === "ja" ? t.kvkJa : t.kvkNee}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-white/65">{a === "ja" ? t.kvkJaUitleg : t.kvkNeeUitleg}</span>
                </span>
                {antwoord === a && <span className="text-[#14D9C9]" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
          {antwoord === "ja" && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-white">{t.kvkSoort}</p>
              <div className="mt-2 grid gap-2" role="radiogroup" aria-label={t.kvkSoort}>
                {WERKVORMEN_MET_KVK.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={metKvk === k}
                    onClick={() => {
                      setVormFout(null);
                      setMetKvk(k);
                    }}
                    className={`${RIJ} ${metKvk === k ? RIJ_AAN : RIJ_UIT}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{t.kinds[k][0]}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-white/65">{t.kinds[k][1]}</span>
                    </span>
                    {metKvk === k && <span className="text-[#14D9C9]" aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {vormFout && (
            <p role="alert" className="mt-3 rounded-lg border border-[#F5C451] bg-[#FFF6DC] px-3 py-2 text-sm text-[#0B1238]">
              {vormFout}
            </p>
          )}
          <div className="sticky bottom-0 -mx-5 mt-6 bg-[#121418]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button type="button" onClick={() => void bewaarWerkvorm()} disabled={!gekozenVorm || vormBezig} className={KNOP}>
              {vormBezig ? t.saving : t.pick}
            </button>
          </div>
        </div>
      ) : stap === 1 ? (
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
              placeholder={t.locatiePlaceholder}
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
                    onClick={() => void bewaarPlek({ lat: h.lat, lng: h.lng, label: h.plaats?.trim() || h.label }, thuisVan(h))}
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
          {/* "Verder" (naar Je gegevens) is de hoofdweg; de klussen bekijken kan ook eerst (22 nov 2026: "Verder" in plaats van
              "Maak een profiel aan", na "Account aanmaken" klonk dat als opnieuw beginnen) */}
          <div className="sticky bottom-0 -mx-5 mt-6 space-y-3 bg-[#121418]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button type="button" onClick={() => void bewaarBranches("profiel")} disabled={brancheBezig} className={KNOP}>
              {brancheBezig ? t.saving : t.brancheProfielAan}
            </button>
            <button type="button" onClick={() => void bewaarBranches("klussen")} disabled={brancheBezig} className={KNOP_OMLIJND}>
              {t.brancheBekijk}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
