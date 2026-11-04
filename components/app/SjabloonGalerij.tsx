"use client";

import { useMemo, useState } from "react";
import { SHIFT_CATEGORIES, shiftCategory, type ShiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// Klus-sjablonen als kaarten met de foto van de branche, een filter per branche
// en zoeken. Gedeeld door het klusformulier van de werkgever (NewShiftForm) en
// /klus-plaatsen (KlusConcept); de sjablonen zelf staan in lib/shifts/catalogus.ts.
// ---------------------------------------------------------------------------

export interface GalerijSjabloon {
  key: string;
  label: string;
  rateCents: number;
  branche?: ShiftCategoryKey | undefined;
}

/** zonder filter of zoekwoord: zoveel kaarten, de rest achter "Toon alle" */
const EERST = 6;

const BY_KEY = new Map<ShiftCategoryKey, ShiftCategory>(SHIFT_CATEGORIES.map((c) => [c.key, c]));
const categorieVan = (t: GalerijSjabloon): ShiftCategory => (t.branche ? BY_KEY.get(t.branche) : undefined) ?? shiftCategory(t.label, null);
const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function SjabloonGalerij({
  sjablonen,
  gekozen,
  onKies,
  kop = "Kies een sjabloon",
}: {
  sjablonen: readonly GalerijSjabloon[];
  /** de key van het gekozen sjabloon, of "" */
  gekozen: string;
  onKies: (key: string) => void;
  kop?: string;
}) {
  const [branche, setBranche] = useState<ShiftCategoryKey | "alle">("alle");
  const [zoek, setZoek] = useState("");
  const [alles, setAlles] = useState(false);

  const branches = useMemo(() => {
    const tel = new Map<ShiftCategoryKey, number>();
    for (const t of sjablonen) {
      const k = categorieVan(t).key;
      tel.set(k, (tel.get(k) ?? 0) + 1);
    }
    return SHIFT_CATEGORIES.filter((c) => tel.has(c.key)).map((c) => ({ ...c, aantal: tel.get(c.key) ?? 0 }));
  }, [sjablonen]);

  const q = zoek.trim().toLowerCase();
  const gefilterd = sjablonen.filter((t) => (branche === "alle" || categorieVan(t).key === branche) && (!q || t.label.toLowerCase().includes(q)));
  // zonder filter eerst één kaart per branche, zodat je meteen ziet hoe breed het aanbod is
  const eerstePerBranche = useMemo(() => {
    const gezien = new Set<ShiftCategoryKey>();
    return sjablonen.filter((t) => {
      const k = categorieVan(t).key;
      if (gezien.has(k)) return false;
      gezien.add(k);
      return true;
    });
  }, [sjablonen]);
  const ingeklapt = branche === "alle" && !q && !alles;
  const zichtbaar = ingeklapt ? eerstePerBranche.slice(0, EERST) : gefilterd;
  // het gekozen sjabloon blijft zichtbaar, ook als het buiten de eerste kaarten valt
  const gekozenSjabloon = gekozen ? sjablonen.find((t) => t.key === gekozen) : undefined;
  const kaarten = gekozenSjabloon && ingeklapt && !zichtbaar.includes(gekozenSjabloon) ? [gekozenSjabloon, ...zichtbaar.slice(0, EERST - 1)] : zichtbaar;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="field-label">{kop} <span className="font-normal text-neutralx-500">(optioneel)</span></p>
        <label className="w-full sm:w-56">
          <span className="sr-only">Zoek een functie</span>
          <input
            type="search"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek een functie…"
            className="field-input py-2 text-sm"
          />
        </label>
      </div>

      <div role="group" aria-label="Filter op branche" className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <BrancheKnop actief={branche === "alle"} onClick={() => setBranche("alle")} label="Alle" aantal={sjablonen.length} />
        {branches.map((c) => (
          <BrancheKnop key={c.key} actief={branche === c.key} onClick={() => setBranche(c.key)} label={c.label} aantal={c.aantal} kleur={c.accent} />
        ))}
      </div>

      {kaarten.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-hairstrong px-4 py-6 text-center text-sm text-neutralx-600">
          Geen sjabloon gevonden voor &ldquo;{zoek.trim()}&rdquo;. Vul de titel hieronder zelf in.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {kaarten.map((t) => {
            const cat = categorieVan(t);
            const actief = t.key === gekozen;
            return (
              <li key={t.key} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={actief}
                  onClick={() => onKies(t.key)}
                  className={`group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-card ${
                    actief ? "border-brand-500 ring-2 ring-brand-500" : "border-hair"
                  }`}
                >
                  <span className="relative block aspect-[16/9] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cat.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: `${cat.accent}e6` }}>
                      {cat.label}
                    </span>
                    {actief && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white" aria-hidden>
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="flex flex-1 flex-col px-2.5 py-2">
                    <span className="text-sm font-semibold leading-snug text-ink">{t.label}</span>
                    <span className="mt-0.5 text-xs text-neutralx-500">vanaf {euro(t.rateCents)}/u</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ingeklapt && sjablonen.length > kaarten.length && (
        <button type="button" onClick={() => setAlles(true)} className="btn-ghost mt-3 w-full text-sm sm:w-auto">
          Toon alle {sjablonen.length} sjablonen in {branches.length} branches
        </button>
      )}
    </div>
  );
}

function BrancheKnop({ actief, onClick, label, aantal, kleur }: { actief: boolean; onClick: () => void; label: string; aantal: number; kleur?: string }) {
  return (
    <button
      type="button"
      aria-pressed={actief}
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        actief ? "border-ink bg-ink text-white" : "border-hair bg-white text-neutralx-700 hover:bg-paper-soft"
      }`}
    >
      {kleur && <span className="h-2 w-2 rounded-full" style={{ background: kleur }} aria-hidden />}
      {label}
      <span className={actief ? "text-white/70" : "text-neutralx-500"}>{aantal}</span>
    </button>
  );
}
