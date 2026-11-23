"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { ShiftCategoryKey } from "@/lib/shifts/category";
import { brancheOpties, categorieVan, euroTekst, kiezerWeergave, type KiezerSjabloon } from "@/lib/shifts/sjabloon-kiezer";
import { SJABLOON_NL, vulIn, type SjabloonTeksten } from "@/lib/shifts/sjabloon-kiezer-teksten";

// ---------------------------------------------------------------------------
// De functiekiezer van de klus-wizard: een zoekveld, één branche-keuzemenu en daaronder de functies als regels (naam,
// branche met een kleurstip, "vanaf € 16,20 per uur"). Zonder zoekwoord eerst een korte lijst "Veelgekozen", met
// "Toon alle functies" erachter. Geen foto's. Gedeeld door het klusformulier van de werkgever (NewShiftForm, NL/EN) en
// /klus-plaatsen (KlusConcept, NL); de sjablonen staan in lib/shifts/catalogus.ts, het zoeken en filteren in
// lib/shifts/sjabloon-kiezer.ts en de teksten in lib/shifts/sjabloon-kiezer-teksten.ts.
// ---------------------------------------------------------------------------

export type GalerijSjabloon = KiezerSjabloon;

/** Meer regels dan dit: de lijst scrolt in een eigen vak in plaats van de pagina eindeloos te rekken. */
const SCROLL_VANAF = 8;

function Prijs({ cents, teksten }: { cents: number; teksten: SjabloonTeksten }) {
  const [voor = "", na = ""] = teksten.vanaf.split("{bedrag}");
  return (
    <>
      {voor}
      <span className="num font-semibold text-ink">{euroTekst(cents, teksten.taal)}</span>
      {na}
    </>
  );
}

export function SjabloonGalerij({
  sjablonen,
  gekozen,
  onKies,
  kop,
  teksten = SJABLOON_NL,
  onEigen,
  verplicht = false,
  meetcode,
}: {
  sjablonen: readonly GalerijSjabloon[];
  /** de key van het gekozen sjabloon, of "" */
  gekozen: string;
  onKies: (key: string) => void;
  /** een eigen kop in plaats van de standaard */
  kop?: string;
  /** de teksten in de taal van de pagina; Nederlands als standaard */
  teksten?: SjabloonTeksten;
  /** "Of vul het zelf in": de pagina brengt de bezoeker naar het veld voor een eigen titel */
  onEigen?: () => void;
  /** dit is de functiekeuze van de pagina (er is geen ander veld voor): dan staat er geen "(optioneel)" achter de kop */
  verplicht?: boolean;
  /** een meetcode (data-track, lib/analytics/label-privacy.ts) op elke functie, voor de pagina die de keuze meet */
  meetcode?: string;
}) {
  const id = useId();
  const [branche, setBranche] = useState<ShiftCategoryKey | "alle">("alle");
  const [zoek, setZoek] = useState("");
  const [alles, setAlles] = useState(false);

  const branches = useMemo(() => brancheOpties(sjablonen), [sjablonen]);
  const weergave = useMemo(() => kiezerWeergave(sjablonen, { zoek, branche, alles, gekozen }), [sjablonen, zoek, branche, alles, gekozen]);
  const items = weergave.items;
  const gefilterd = zoek.trim() !== "" || branche !== "alle";
  const status = weergave.modus === "veelgekozen" ? teksten.veelgekozen : items.length === 1 ? teksten.gevondenEen : vulIn(teksten.gevondenMeer, { n: items.length });

  // Enter in het zoekveld kiest de enige treffer en dient nooit het hele formulier in
  function zoekToets(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    const enige = items.length === 1 ? items[0] : undefined;
    if (enige) onKies(enige.key);
  }

  return (
    // min-w-0: nooit breder dan de kolom van het formulier
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="field-label">
          {kop ?? teksten.kop} {!verplicht && <span className="font-normal text-neutralx-500">{teksten.optioneel}</span>}
        </p>
        <p aria-live="polite" className="text-xs text-neutralx-600">
          {status}
        </p>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <label htmlFor={`${id}-zoek`} className="sr-only">
            {teksten.zoekLabel}
          </label>
          <input
            id={`${id}-zoek`}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            onKeyDown={zoekToets}
            placeholder={teksten.zoekPlaceholder}
            className="field-input mt-0"
          />
        </div>
        <div>
          <label htmlFor={`${id}-branche`} className="sr-only">
            {teksten.brancheLabel}
          </label>
          <select
            id={`${id}-branche`}
            value={branche}
            onChange={(e) => setBranche(branches.find((c) => c.key === e.target.value)?.key ?? "alle")}
            className="field-input mt-0"
          >
            <option value="alle">{teksten.alleBranches}</option>
            {branches.map((c) => (
              <option key={c.key} value={c.key}>
                {teksten.branches[c.key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-hairstrong px-4 py-6 text-center text-sm text-neutralx-600">
          {vulIn(teksten.geenResultaat, { zoek: zoek.trim() })}
        </p>
      ) : (
        <ul
          aria-label={kop ?? teksten.kop}
          className={`mt-3 divide-y divide-hair rounded-xl border border-hair bg-white ${
            items.length > SCROLL_VANAF ? "max-h-[22rem] overflow-y-auto overflow-x-hidden" : "overflow-hidden"
          }`}
        >
          {items.map((t) => {
            const cat = categorieVan(t);
            const actief = t.key === gekozen;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  aria-pressed={actief}
                  {...(meetcode ? { "data-track": meetcode } : {})}
                  onClick={() => onKies(t.key)}
                  className={`flex min-h-[3.5rem] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 ${
                    actief ? "bg-brand-50" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-ink">{t.label}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutralx-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ background: cat.accent, boxShadow: "0 0 0 1px rgba(128,128,128,0.45)" }}
                        />
                        {teksten.branches[cat.key]}
                      </span>
                      {/* op een telefoon onder de naam, vanaf sm rechts */}
                      <span className="sm:hidden">
                        <Prijs cents={t.rateCents} teksten={teksten} />
                      </span>
                    </span>
                  </span>
                  <span className="hidden flex-shrink-0 text-right text-xs text-neutralx-600 sm:block">
                    <Prijs cents={t.rateCents} teksten={teksten} />
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border ${actief ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong"}`}
                  >
                    {actief && (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.5 8.5l3 3 6-7" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {!gefilterd && (
          <button type="button" aria-expanded={alles} onClick={() => setAlles((a) => !a)} className="btn-ghost min-h-[44px] w-full sm:w-auto">
            {alles ? teksten.toonMinder : vulIn(teksten.toonAlle, { n: sjablonen.length })}
          </button>
        )}
        {onEigen && (
          <button type="button" onClick={onEigen} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600 hover:underline">
            {teksten.eigen}
          </button>
        )}
      </div>
    </div>
  );
}
