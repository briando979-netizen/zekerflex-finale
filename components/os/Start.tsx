"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OS_CATEGORIEEN, perCategorie, zoekApps, type OsApp } from "@/lib/os/apps";
import { OsIcoonVak } from "@/components/os/Iconen";

// ---------------------------------------------------------------------------
// Het startmenu: zoeken en alle apps per categorie. Opent met de startknop of
// met Ctrl+K / Cmd+K. Pijltjes omhoog en omlaag lopen door de resultaten,
// Enter opent, Escape sluit.
// ---------------------------------------------------------------------------

const tintVan = (app: OsApp) => OS_CATEGORIEEN.find((c) => c.id === app.categorie)?.tint ?? "leisteen";

function AppRij({ app, gekozen, onOpen, onVastzetten, vast }: { app: OsApp; gekozen: boolean; onOpen: () => void; onVastzetten: () => void; vast: boolean }) {
  return (
    <li className={`flex items-center gap-1 rounded-xl ${gekozen ? "bg-white/[0.12]" : "hover:bg-white/[0.07]"}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left">
        <OsIcoonVak icoon={app.icoon} tint={tintVan(app)} maat="klein" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{app.naam}</span>
          <span className="block truncate text-xs text-white/50">{app.uitleg}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onVastzetten}
        aria-label={vast ? `${app.naam} van het bureaublad halen` : `${app.naam} op het bureaublad zetten`}
        title={vast ? "Van het bureaublad halen" : "Op het bureaublad zetten"}
        className={`mr-1.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg transition ${vast ? "text-amber-200 hover:bg-white/10" : "text-white/35 hover:bg-white/10 hover:text-white/70"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={vast ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.2-5.4-2.9-5.4 2.9 1-6.2L3.2 9.5l6.1-.9z" />
        </svg>
      </button>
    </li>
  );
}

export function Start({ apps, vastgezet, open, onSluit, onOpenApp, onVastzetten }: { apps: OsApp[]; vastgezet: string[]; open: boolean; onSluit: () => void; onOpenApp: (app: OsApp) => void; onVastzetten: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const [index, setIndex] = useState(0);
  const veld = useRef<HTMLInputElement>(null);
  const resultaten = useMemo(() => (term.trim() ? zoekApps(apps, term) : []), [apps, term]);
  const groepen = useMemo(() => perCategorie(apps), [apps]);
  const vast = useMemo(() => new Set(vastgezet), [vastgezet]);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setIndex(0);
    const t = window.setTimeout(() => veld.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const kies = (app: OsApp) => {
    onOpenApp(app);
    onSluit();
  };

  return (
    <>
      <button type="button" aria-label="Startmenu sluiten" onClick={onSluit} className="fixed inset-0 z-[60] cursor-default bg-black/40 backdrop-blur-[2px]" />
      <div role="dialog" aria-label="Alle apps" className="fixed bottom-[64px] left-1/2 z-[61] flex max-h-[72vh] w-[min(760px,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0C0E12]/95 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex-shrink-0 border-b border-white/10 p-3">
          <label htmlFor="os-zoek" className="sr-only">
            Zoek een app
          </label>
          <input
            id="os-zoek"
            ref={veld}
            type="search"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onSluit();
              if (!resultaten.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => (i + 1) % resultaten.length);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => (i - 1 + resultaten.length) % resultaten.length);
              }
              if (e.key === "Enter") {
                const app = resultaten[index];
                if (app) kies(app);
              }
            }}
            placeholder="Zoek een app of typ wat je zoekt…"
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[0.975rem] text-white placeholder:text-white/40"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {term.trim() ? (
            resultaten.length ? (
              <ul className="space-y-0.5">
                {resultaten.map((app, i) => (
                  <AppRij key={app.id} app={app} gekozen={i === index} onOpen={() => kies(app)} onVastzetten={() => onVastzetten(app.id)} vast={vast.has(app.id)} />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-6 text-center text-sm text-white/50">Niets gevonden voor &ldquo;{term}&rdquo;.</p>
            )
          ) : (
            <div className="space-y-4">
              {groepen.map((g) => (
                <section key={g.categorie.id}>
                  <h2 className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{g.categorie.naam}</h2>
                  <ul className="grid gap-0.5 sm:grid-cols-2">
                    {g.apps.map((app) => (
                      <AppRij key={app.id} app={app} gekozen={false} onOpen={() => kies(app)} onVastzetten={() => onVastzetten(app.id)} vast={vast.has(app.id)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <p className="flex-shrink-0 border-t border-white/10 px-4 py-2 text-[11px] text-white/40">
          Tip: Ctrl + K opent dit menu. Met de ster zet je een app op je bureaublad.
        </p>
      </div>
    </>
  );
}
