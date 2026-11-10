"use client";

import { useEffect, useRef, useState } from "react";
import { WERKRUIMTES, WERKRUIMTE_INFO, type Werkruimte } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// Wisselen tussen de dashboards van je bedrijf (lib/werkgever/werkruimte.ts): personeel, rijschool,
// horeca, website, webshop. Een dashboard dat het bedrijf al heeft, opent meteen (alleen in deze
// browser); de beheerder kan er een toevoegen, met de bedrijfsgegevens die er al zijn.
// Na het wisselen een volledige paginalading: de layout bouwt het menu dan opnieuw op.
// ---------------------------------------------------------------------------

export interface DashboardStand {
  actief: Werkruimte;
  dashboards: Werkruimte[];
  /** de beheerder van het bedrijf: mag een dashboard toevoegen */
  kanToevoegen: boolean;
}

export function DashboardWisselaar({
  stand,
  ingeklapt = false,
  donker = false,
}: {
  stand: DashboardStand;
  /** de ingeklapte zijbalk van de werkgever-app: alleen een knop */
  ingeklapt?: boolean;
  /** op de donkere balk van de studio */
  donker?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState<Werkruimte | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const nieuw = stand.kanToevoegen ? WERKRUIMTES.filter((w) => !stand.dashboards.includes(w)) : [];

  // buiten het menu tikken sluit het (ook op een tablet zonder hover)
  useEffect(() => {
    if (!open) return;
    const weg = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", weg);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", weg);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // één dashboard en niets toe te voegen: niets te wisselen
  if (stand.dashboards.length < 2 && nieuw.length === 0) return null;

  async function kies(soort: Werkruimte) {
    if (soort === stand.actief) {
      setOpen(false);
      return;
    }
    setBezig(soort);
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/dashboard/wissel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soort }),
      });
      const body = (await res.json().catch(() => null)) as { ga?: string; error?: { message?: string } } | null;
      if (!res.ok || !body?.ga) throw new Error(body?.error?.message ?? "Wisselen lukte niet. Probeer het opnieuw.");
      window.location.assign(body.ga);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Wisselen lukte niet. Probeer het opnieuw.");
      setBezig(null);
    }
  }

  const naam = WERKRUIMTE_INFO[stand.actief].naam;
  const knop = donker
    ? "flex w-full items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-left text-sm font-semibold text-[#1a1a1a] hover:bg-white/80"
    : `flex w-full items-center gap-2 rounded-xl border border-hairstrong bg-white text-left text-sm font-semibold text-ink transition hover:border-brand-400 ${ingeklapt ? "justify-center px-2 py-2" : "px-3 py-2"}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ingeklapt ? `Dashboard: ${naam}. Wissel van dashboard` : undefined}
        title={ingeklapt ? `Dashboard: ${naam}` : undefined}
        className={knop}
      >
        {ingeklapt ? (
          <span aria-hidden>⇄</span>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className={`block text-[11px] font-medium uppercase tracking-wider ${donker ? "text-[#616161]" : "text-neutralx-400"}`}>Dashboard</span>
              <span className="block truncate">{naam}</span>
            </span>
            <span aria-hidden className={donker ? "text-[#616161]" : "text-neutralx-400"}>
              ▾
            </span>
          </>
        )}
      </button>

      {open && (
        <div className={`absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border bg-white p-1.5 shadow-lift ${donker ? "border-black/10" : "border-hair"}`}>
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-neutralx-500">Je dashboards</p>
          <ul>
            {stand.dashboards.map((w) => (
              <li key={w}>
                <button
                  type="button"
                  onClick={() => void kies(w)}
                  disabled={bezig !== null}
                  aria-current={w === stand.actief ? "true" : undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft disabled:opacity-60"
                >
                  <span className="flex-1 font-medium">{WERKRUIMTE_INFO[w].naam}</span>
                  {w === stand.actief && <span className="text-xs font-semibold text-brand-600">open</span>}
                  {bezig === w && <span className="text-xs text-neutralx-500">bezig…</span>}
                </button>
              </li>
            ))}
          </ul>
          {nieuw.length > 0 && (
            <>
              <p className="mt-1 border-t border-hair px-3 pb-1 pt-2 text-xs font-semibold text-neutralx-500">Dashboard toevoegen</p>
              <ul>
                {nieuw.map((w) => (
                  <li key={w}>
                    <button
                      type="button"
                      onClick={() => void kies(w)}
                      disabled={bezig !== null}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper-soft disabled:opacity-60"
                    >
                      <span className="block text-sm font-medium text-ink">
                        + {WERKRUIMTE_INFO[w].naam}
                        {bezig === w && <span className="ml-2 text-xs font-normal text-neutralx-500">bezig…</span>}
                      </span>
                      <span className="block text-xs text-neutralx-600">{WERKRUIMTE_INFO[w].uitleg}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-3 pb-1.5 pt-1 text-[11px] leading-snug text-neutralx-500">Je bedrijfsgegevens gaan mee; je vult alleen in wat dat dashboard nog nodig heeft.</p>
            </>
          )}
          {fout && (
            <p role="alert" className="mx-1.5 mb-1 rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit">
              {fout}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
