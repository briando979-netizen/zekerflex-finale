"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { TIJDLIJN_VOLGORDE, stapVanTotaal, tijdlijnStappen, volgendeStap, type TijdlijnSleutel } from "@/lib/onboarding/laat-weten";
import { vulIn } from "@/lib/i18n/vul-in";
import { ALLE_BRANCHES_ICOON, BRANCHE_OPTIES, brancheSamenvatting, type BrancheKeuze } from "@/lib/shifts/branche-keuze";

type Kind = "zzp" | "flexwerker" | "uitzendkracht";
type StepKey = TijdlijnSleutel;

const KINDS: Kind[] = ["zzp", "flexwerker", "uitzendkracht"];

// Een branche is een rij met een pictogram-tegel en de naam (zoals het branche-scherm van YoungOnes, 20 nov): gekozen = rand
// in de merkkleur plus een vinkje, niet alleen een kleur (ook te zien zonder kleur).
const BRANCHE_RIJ = "flex min-h-[44px] items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
const BRANCHE_RIJ_AAN = "border-brand-500 bg-brand-50";
const BRANCHE_RIJ_UIT = "border-hairstrong bg-white hover:border-brand-500";
const BRANCHE_TEGEL = "grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-paper-soft text-xl leading-none";

/**
 * De start van een nieuwe werker, zoals de start van een werkgever: eerst kiezen welke richting
 * (ZZP'er, flexwerker of uitzendkracht), dan e-mail bevestigen, dan gegevens en identiteit.
 * Staat bovenaan "Vind jouw klus" tot het profiel compleet is. De gegevens zelf (KVK, btw, BSN,
 * IBAN) staan op /dashboard/verificatie; hier alleen de keuze die de rest bepaalt.
 */
export function WerkerStartWizard({
  workerKind,
  emailVerified,
  profileComplete,
  gegevensIngevuld,
  identiteitIngestuurd,
  werkrechtOk,
  tweestapAan = true,
  fotoGezet = true,
  brancheKeuze,
}: {
  /** de branches die de werker al koos, of null */
  brancheKeuze: BrancheKeuze | null;
  workerKind: Kind | null;
  emailVerified: boolean;
  profileComplete: boolean;
  /** de gegevens van de werker zijn ingevuld (poortfeit); zonder: de oude profileComplete */
  gegevensIngevuld?: boolean;
  /** de ID-controle is ingestuurd of geverifieerd (poortfeit); zonder: de oude profileComplete */
  identiteitIngestuurd?: boolean;
  /** recht om te werken in Nederland in orde (lib/werkrecht): verklaring + bewijs */
  werkrechtOk: boolean;
  /** tweestapsverificatie of passkey aan; sinds 12 nov optioneel: alleen een aanbeveling onder de stappen */
  tweestapAan?: boolean;
  /** profielfoto geüpload (poortfeit); na de poort altijd waar */
  fotoGezet?: boolean;
}) {
  const ft = useFT();
  const t = ft.start;
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(workerKind);
  const [pick, setPick] = useState<Kind | null>(workerKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keuze, setKeuze] = useState<BrancheKeuze | null>(brancheKeuze);
  const [gekozen, setGekozen] = useState<Set<string>>(new Set(brancheKeuze?.alle ? BRANCHE_OPTIES.map((o) => o.key) : (brancheKeuze?.branches ?? [])));
  const alleGekozen = gekozen.size === BRANCHE_OPTIES.length;
  const [brancheBusy, setBrancheBusy] = useState(false);
  const [brancheFout, setBrancheFout] = useState<string | null>(null);
  const kaartRef = useRef<HTMLElement>(null);

  // na de ID-check staat de richting vast in de start; wijzigen kan dan onder Fiscaal (app/api/me/richting)
  const richtingVast = Boolean(identiteitIngestuurd ?? profileComplete);
  const done: Record<StepKey, boolean> = { kind: kind !== null, branches: keuze !== null, email: emailVerified, gegevens: gegevensIngevuld ?? profileComplete, identiteit: identiteitIngestuurd ?? profileComplete, foto: fotoGezet, werkrecht: werkrechtOk, tweestap: tweestapAan };
  const ORDER = TIJDLIJN_VOLGORDE;
  const first = volgendeStap(done);
  const [open, setOpen] = useState<StepKey>(first ?? "gegevens");
  const [gesloten, setGesloten] = useState(false);
  const completed = ORDER.filter((k) => done[k]).length;
  const pct = Math.round((completed / ORDER.length) * 100);
  const label: Record<StepKey, string> = { kind: t.kindStep, branches: t.brancheStep, email: t.emailStep, gegevens: t.gegevensStep, identiteit: t.identiteitStep, foto: t.fotoStep, werkrecht: t.werkrechtStep, tweestap: t.tweestapStep };

  function wissel(sleutel: string) {
    setBrancheFout(null);
    setGekozen((vorig) => {
      const volgend = new Set(vorig);
      if (volgend.has(sleutel)) volgend.delete(sleutel);
      else volgend.add(sleutel);
      return volgend;
    });
  }

  /**
   * Twee knoppen, zoals bij YoungOnes: "Bekijk de klussen" bewaart de keuze en scrolt naar de lijst eronder (de volgende stap
   * staat dan open bovenaan); "Maak je profiel af" bewaart en opent meteen de stap Je gegevens.
   */
  async function bewaarBranches(doel: "klussen" | "profiel") {
    if (brancheBusy) return;
    if (gekozen.size === 0) {
      setBrancheFout(t.brancheKies);
      return;
    }
    setBrancheBusy(true);
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
        return;
      }
      setKeuze((d as { keuze: BrancheKeuze }).keuze);
      setOpen("gegevens");
      router.refresh();
      if (doel === "klussen" && kaartRef.current) {
        // naar de klussen onder de kaart; de bovenkant van de lijst komt net onder de kopbalk
        const onder = kaartRef.current.getBoundingClientRect().bottom + window.scrollY - 72;
        window.scrollTo({ top: Math.max(0, onder), behavior: "smooth" });
      }
    } catch {
      setBrancheFout(t.saveError);
    } finally {
      setBrancheBusy(false);
    }
  }

  async function save() {
    if (!pick || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/richting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: pick }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setError(typeof msg === "string" ? msg : t.saveError);
        return;
      }
      const eerder = kind;
      setKind(pick);
      // een eerste keuze brengt je naar de volgende stap; een wijziging laat je waar je was
      if (eerder === null) setOpen(keuze === null ? "branches" : "gegevens");
      router.refresh();
    } catch {
      setError(t.saveError);
    } finally {
      setBusy(false);
    }
  }

  const stap = stapVanTotaal(done);
  const stappen = tijdlijnStappen(done);

  // Eén uitleg per stap: de bestaande teksten (vijf talen), niets nieuws verzonnen.
  // wat "gegevens" per soort echt vraagt (12 nov, meting 52: 19 van 20 nieuwe werkers stonden hier stil; het BSN stond nergens)
  const gegevensUitleg = kind === "uitzendkracht" ? t.gegevensUitzend : kind === "zzp" ? t.gegevensZzp : kind === "flexwerker" ? t.gegevensFlex : t.gegevensBody;
  const uitleg: Record<StepKey, string> = { kind: t.kindHint, branches: t.brancheHint, email: t.emailBody, gegevens: gegevensUitleg, identiteit: t.identiteitBody, foto: t.fotoBody, werkrecht: t.werkrechtBody, tweestap: t.tweestapBody };
  const actie = (k: StepKey): { href: string; tekst: string } | null =>
    k === "email" ? { href: "/verifieer-email", tekst: t.emailCta }
    : k === "gegevens" ? { href: "/dashboard/verificatie", tekst: t.gegevensCta }
    : k === "identiteit" ? { href: "/dashboard/verificatie", tekst: t.identiteitCta }
    : k === "foto" ? { href: "/dashboard/eerste-indruk?stap=foto", tekst: t.fotoCta }
    : k === "werkrecht" ? { href: "/dashboard/verificatie#werkrecht", tekst: t.werkrechtCta }
    : k === "tweestap" ? { href: "/dashboard/account/passkeys", tekst: t.tweestapCta }
    : null;

  if (gesloten) return null;

  return (
    <section ref={kaartRef} className="mb-6 overflow-hidden rounded-2xl border border-hair bg-white shadow-sm" aria-labelledby="werker-start-titel">
      <div className="relative bg-gradient-to-br from-brand-700 via-brand-700 to-brand-500 px-5 pb-8 pt-5 text-white">
        <button
          type="button"
          onClick={() => setGesloten(true)}
          aria-label={t.sluiten}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-xl leading-none text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span aria-hidden>×</span>
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{t.eyebrow}</p>
        <h2 id="werker-start-titel" className="mt-1 pr-10 font-display text-2xl font-bold leading-tight">{t.laatWeten}</h2>
        <p className="mt-1 text-sm text-white/85" role="status">
          {stap ? `${vulIn(t.stapVan, { n: stap.n, totaal: stap.totaal })}: ${label[stap.sleutel]}` : t.alleKlaar}
        </p>
        {/* de voortgang als losse segmenten, één per stap (zoals de balk boven de start van YoungOnes, 20 nov): klaar = wit, aan de beurt = half */}
        <div className="mt-3 flex gap-1.5" role="progressbar" aria-label={t.progress.replace("{done}", String(completed)).replace("{total}", String(ORDER.length))} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          {stappen.map(({ key: sk, stand: ss }) => (
            <span key={sk} className={`h-1.5 flex-1 rounded-full transition-colors ${ss === "klaar" ? "bg-white" : ss === "actief" ? "bg-white/60" : "bg-white/20"}`} aria-hidden />
          ))}
        </div>
      </div>

      <ol className="relative -mt-4 rounded-t-2xl bg-white px-4 pb-2 pt-5">
        {stappen.map(({ key: k, stand }, i) => {
          const isOpen = stand === "actief" || (stand === "klaar" && open === k);
          const uitgeschakeld = stand === "volgende";
          const a = actie(k);
          const laatste = i === stappen.length - 1;
          return (
            // een stap die nog niet aan de beurt is, is één compacte regel (nummer en titel): geen kaart en geen uitleg,
            // anders wordt het scherm van een nieuwe werker erg lang (20 nov 2026)
            <li key={k} className={`relative flex gap-3 ${uitgeschakeld ? "pb-2" : "pb-4"}`}>
              {!laatste && <span className={`absolute bottom-0 left-[13px] top-7 w-0.5 ${stand === "klaar" ? "bg-ok/40" : "bg-hair"}`} aria-hidden />}
              <span
                className={`relative z-10 mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                  stand === "klaar" ? "bg-ok text-white" : stand === "actief" ? "bg-brand-500 text-white ring-4 ring-brand-100" : "bg-hair text-neutralx-500"
                }`}
                aria-hidden
              >
                {stand === "klaar" ? "✓" : i + 1}
              </span>
              <div
                className={
                  uitgeschakeld
                    ? "min-w-0 flex-1 pt-2"
                    : `min-w-0 flex-1 rounded-xl border p-4 ${stand === "actief" ? "border-brand-500/40 bg-white shadow-sm" : "border-hair bg-white"}`
                }
                aria-current={stand === "actief" ? "step" : undefined}
              >
                {/* alleen een afgeronde stap is te openen; de andere titels zijn gewone tekst (een uitgeschakelde knop leest een schermlezer als "niet beschikbaar") */}
                {stand === "klaar" ? (
                  <button
                    type="button"
                    onClick={() => setOpen(open === k ? (first ?? "gegevens") : k)}
                    aria-expanded={isOpen}
                    className="flex min-h-[44px] w-full items-center gap-2 text-left text-sm font-semibold text-ink"
                  >
                    <span className="flex-1">{label[k]}</span>
                    <span className="text-xs font-normal text-ok">{t.klaarLabel}</span>
                  </button>
                ) : (
                  <p className={`flex items-center gap-2 text-sm font-semibold ${uitgeschakeld ? "text-neutralx-500" : "text-ink"}`}>
                    <span className="flex-1">{label[k]}</span>
                  </p>
                )}
                {k === "kind" && kind && !isOpen && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutralx-500">
                    <span>{t.chosen.replace("{kind}", t.kinds[kind][0] ?? "")}</span>
                    {richtingVast ? (
                      <Link href="/dashboard/fiscaal" aria-label={`${t.wijzig}: ${label[k]}`} className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 underline underline-offset-2">
                        {t.wijzig}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setOpen("kind")} aria-label={`${t.wijzig}: ${label[k]}`} className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 underline underline-offset-2">
                        {t.wijzig}
                      </button>
                    )}
                  </p>
                )}
                {k === "branches" && keuze && !isOpen && (
                  <p className="mt-0.5 flex items-center gap-x-2 text-xs text-neutralx-500">
                    <span className="min-w-0 truncate">{t.brancheChosen.replace("{namen}", brancheSamenvatting(keuze, t.alleBranches, t.brancheEn, t.brancheAndere, (b) => ft.cat[b]))}</span>
                    <button type="button" onClick={() => setOpen("branches")} aria-label={`${t.wijzig}: ${label[k]}`} className="inline-flex min-h-[44px] flex-shrink-0 items-center font-semibold text-brand-600 underline underline-offset-2">
                      {t.wijzig}
                    </button>
                  </p>
                )}
                {/* de uitleg alleen bij de stap die aan de beurt is; een latere stap toont alleen zijn titel */}
                {stand === "actief" && k !== "kind" && k !== "branches" && <p className="mt-1 text-xs leading-snug text-neutralx-600">{uitleg[k]}</p>}
                {stand === "actief" && a && (
                  <Link href={a.href} className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
                    {a.tekst} <span aria-hidden>›</span>
                  </Link>
                )}

                {isOpen && k === "kind" && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-neutralx-500">{t.kindHint}</p>
                    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t.kindStep}>
                      {KINDS.map((opt) => {
                        const on = pick === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            // keuzerondje met het toetsenbord: één tabstop (de gekozen, of de eerste), pijltjes verplaatsen de keuze
                            tabIndex={on || (pick === null && opt === KINDS[0]) ? 0 : -1}
                            onKeyDown={(e) => {
                              const stap = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                              if (!stap) return;
                              e.preventDefault();
                              const volgende = KINDS[(KINDS.indexOf(opt) + stap + KINDS.length) % KINDS.length];
                              if (!volgende) return;
                              setError(null);
                              setPick(volgende);
                              const knoppen = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
                              knoppen?.[KINDS.indexOf(volgende)]?.focus();
                            }}
                            onClick={() => {
                              setError(null);
                              setPick(opt);
                            }}
                            className={`rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                              on ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:border-brand-500"
                            }`}
                          >
                            <span className="block text-sm font-semibold text-ink">{t.kinds[opt][0]}</span>
                            <span className="mt-1 block text-xs leading-snug text-neutralx-500">{t.kinds[opt][1]}</span>
                          </button>
                        );
                      })}
                    </div>
                    {error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
                    {(kind === null || pick !== kind) &&
                      (richtingVast && kind !== null ? (
                        // de server staat een andere richting na de ID-check alleen onder Fiscaal toe (api/me/richting)
                        <p className="text-xs leading-snug text-neutralx-600">
                          {t.richtingVast}{" "}
                          <Link href="/dashboard/fiscaal" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 underline underline-offset-2">
                            {t.naarFiscaal}
                          </Link>
                        </p>
                      ) : (
                        <button type="button" onClick={save} disabled={!pick || busy} className="btn-primary min-h-[44px] text-sm disabled:opacity-50">
                          {busy ? t.saving : t.pick}
                        </button>
                      ))}
                  </div>
                )}

                {isOpen && k === "branches" && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-neutralx-500">{t.brancheHint}</p>
                    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t.brancheStep}>
                      <button
                        type="button"
                        aria-pressed={alleGekozen}
                        onClick={() => setGekozen(alleGekozen ? new Set() : new Set(BRANCHE_OPTIES.map((o) => o.key)))}
                        className={`${BRANCHE_RIJ} ${alleGekozen ? BRANCHE_RIJ_AAN : BRANCHE_RIJ_UIT}`}
                      >
                        <span className={BRANCHE_TEGEL} aria-hidden>{ALLE_BRANCHES_ICOON}</span>
                        <span className="flex-1 text-sm font-semibold text-ink">{t.alleBranches}</span>
                        {alleGekozen && <span className="text-sm font-bold text-brand-600" aria-hidden>✓</span>}
                      </button>
                      {BRANCHE_OPTIES.map((o) => {
                        const aan = gekozen.has(o.key);
                        return (
                          <button key={o.key} type="button" aria-pressed={aan} onClick={() => wissel(o.key)} className={`${BRANCHE_RIJ} ${aan ? BRANCHE_RIJ_AAN : BRANCHE_RIJ_UIT}`}>
                            <span className={BRANCHE_TEGEL} aria-hidden>{o.icoon}</span>
                            <span className={`flex-1 text-sm ${aan ? "font-semibold text-ink" : "text-neutralx-700"}`}>{ft.cat[o.key] ?? o.label}</span>
                            {aan && <span className="text-sm font-bold text-brand-600" aria-hidden>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    {brancheFout && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{brancheFout}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => void bewaarBranches("klussen")} disabled={brancheBusy} className="btn-primary min-h-[44px] flex-1 text-sm disabled:opacity-50">
                        {brancheBusy ? t.saving : t.brancheBekijk}
                      </button>
                      <button type="button" onClick={() => void bewaarBranches("profiel")} disabled={brancheBusy} className="btn-ghost min-h-[44px] flex-1 border border-hairstrong text-sm font-semibold disabled:opacity-50">
                        {t.brancheProfiel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {/* tweestapsverificatie is optioneel (12 nov) en staat onder Account → Beveiliging; niet midden in de 5 stappen (15 nov) */}
      <p className="border-t border-hair bg-paper-soft px-5 py-3 text-center text-xs text-neutralx-500">{t.browse}</p>
    </section>
  );
}
