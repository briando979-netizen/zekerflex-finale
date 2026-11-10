"use client";

import { useEffect, useRef, useState } from "react";
import { OnderSheet } from "@/components/app/OnderSheet";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { dagenInMaand, leesDatum, maakDatum } from "@/lib/onboarding/wie-ben-jij";

// ---------------------------------------------------------------------------
// "Wat is je geboortedatum?": een onderste sheet met een draaiwiel van drie kolommen (dag, maand,
// jaar). Elke kolom is een scrollkolom met scroll-snap, en tegelijk een lijstkiezer
// (role="listbox") die met de pijltjes, Home/End en PageUp/PageDown werkt, zodat het ook met een
// toetsenbord of schermlezer kan. De datum zelf wordt pas bevestigd met "Bevestigen".
// ---------------------------------------------------------------------------

const RIJ = 40; // px per regel; zelfde waarde als h-10

interface Item {
  waarde: number;
  label: string;
}

function Wiel({ label, hint, items, waarde, onKies }: { label: string; hint: string; items: Item[]; waarde: number; onKies: (w: number) => void }) {
  const lijst = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.findIndex((i) => i.waarde === waarde));
  const hintId = `wiel-hint-${label}`;

  // de gekozen regel in het midden zetten (ook bij het openen en na een toetsaanslag)
  useEffect(() => {
    const el = lijst.current;
    if (el && Math.abs(el.scrollTop - index * RIJ) > 1) el.scrollTop = index * RIJ;
  }, [index, items.length]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function naScrollen() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = lijst.current;
      if (!el) return;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / RIJ)));
      const kies = items[i];
      if (kies && kies.waarde !== waarde) onKies(kies.waarde);
    }, 90);
  }

  function toets(e: React.KeyboardEvent<HTMLDivElement>) {
    const stap = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "PageDown" ? 5 : e.key === "PageUp" ? -5 : 0;
    let nieuw = index + stap;
    if (e.key === "Home") nieuw = 0;
    else if (e.key === "End") nieuw = items.length - 1;
    else if (!stap) return;
    e.preventDefault();
    const kies = items[Math.min(items.length - 1, Math.max(0, nieuw))];
    if (kies) onKies(kies.waarde);
  }

  return (
    <div className="flex-1">
      <p id={`wiel-${label}`} className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-neutralx-500">
        {label}
      </p>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <div className="relative">
        {/* de band die de gekozen regel aanwijst */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-brand-50" />
        <div
          ref={lijst}
          role="listbox"
          tabIndex={0}
          aria-labelledby={`wiel-${label}`}
          aria-describedby={hintId}
          aria-activedescendant={`wiel-${label}-${waarde}`}
          onScroll={naScrollen}
          onKeyDown={toets}
          className="relative h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg py-20 [scrollbar-width:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((i) => (
            <div
              key={i.waarde}
              id={`wiel-${label}-${i.waarde}`}
              role="option"
              aria-selected={i.waarde === waarde}
              onClick={() => onKies(i.waarde)}
              className={`grid h-10 snap-center place-items-center text-lg ${i.waarde === waarde ? "font-bold text-ink" : "text-neutralx-400"}`}
            >
              {i.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GeboortedatumSheet({
  open,
  waarde,
  teksten,
  onBevestig,
  onSluit,
}: {
  open: boolean;
  /** YYYY-MM-DD of leeg */
  waarde: string;
  teksten: { titel: string; dag: string; maand: string; jaar: string; bevestigen: string; annuleren: string; wielHint: string; maanden: string[] };
  onBevestig: (datum: string) => void;
  onSluit: () => void;
}) {
  const nuJaar = Number(amsterdamDayKey(new Date()).slice(0, 4));
  const begin = leesDatum(waarde) ?? { jaar: nuJaar - 25, maand: 1, dag: 1 };
  const [jaar, setJaar] = useState(begin.jaar);
  const [maand, setMaand] = useState(begin.maand);
  const [dag, setDag] = useState(begin.dag);

  // bij het openen opnieuw beginnen vanaf de bewaarde waarde
  useEffect(() => {
    if (!open) return;
    const b = leesDatum(waarde) ?? { jaar: nuJaar - 25, maand: 1, dag: 1 };
    setJaar(b.jaar);
    setMaand(b.maand);
    setDag(b.dag);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen
  }, [open]);

  const max = dagenInMaand(jaar, maand);
  const dagGeldig = Math.min(dag, max);
  const dagen: Item[] = Array.from({ length: max }, (_, i) => ({ waarde: i + 1, label: String(i + 1) }));
  const maanden: Item[] = teksten.maanden.map((m, i) => ({ waarde: i + 1, label: m }));
  const jaren: Item[] = Array.from({ length: 101 }, (_, i) => ({ waarde: nuJaar - i, label: String(nuJaar - i) }));

  return (
    <OnderSheet open={open} titelId="datum-titel" titel={teksten.titel} onSluit={onSluit}>
      <div className="flex gap-2 px-6 pt-2">
        <Wiel label={teksten.dag} hint={teksten.wielHint} items={dagen} waarde={dagGeldig} onKies={setDag} />
        <Wiel label={teksten.maand} hint={teksten.wielHint} items={maanden} waarde={maand} onKies={setMaand} />
        <Wiel label={teksten.jaar} hint={teksten.wielHint} items={jaren} waarde={jaar} onKies={setJaar} />
      </div>
      <div className="px-6 pb-6 pt-4">
        <button type="button" onClick={() => onBevestig(maakDatum(jaar, maand, dagGeldig))} className="btn-primary w-full">
          {teksten.bevestigen}
        </button>
        <button type="button" onClick={onSluit} className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold text-brand-600 hover:bg-paper-soft">
          {teksten.annuleren}
        </button>
      </div>
    </OnderSheet>
  );
}
