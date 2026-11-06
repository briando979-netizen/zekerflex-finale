"use client";

import { useEffect, useRef, useState } from "react";
import { tintVanApp, type OsApp } from "@/lib/os/apps";
import { OsIcoonVak } from "@/components/os/Iconen";

// ---------------------------------------------------------------------------
// Eén app op het bureaublad. Klikken opent de app; met het knopje ⋮ orden je
// je bureaublad: in een eigen tabblad openen, naar links of rechts schuiven,
// of van het bureaublad halen. Knoppen in plaats van slepen, zodat het ook
// met het toetsenbord en op een telefoon werkt.
// ---------------------------------------------------------------------------

export function Tegel({
  app,
  eerste,
  laatste,
  onOpen,
  onVerplaats,
  onAfhalen,
}: {
  app: OsApp;
  eerste: boolean;
  laatste: boolean;
  onOpen: () => void;
  onVerplaats: (richting: -1 | 1) => void;
  onAfhalen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const vak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const buiten = (e: PointerEvent) => {
      if (vak.current && !vak.current.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", buiten);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("pointerdown", buiten);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);

  const item = "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-white/85 transition hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div ref={vak} className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center transition hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-mint"
      >
        <OsIcoonVak icoon={app.icoon} tint={tintVanApp(app)} maat="groot" />
        <span className="line-clamp-2 text-xs font-semibold leading-snug text-white/90">{app.naam}</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Opties voor ${app.naam}`}
        // op een telefoon is er geen muis, dus daar staat het knopje er altijd; op een groot scherm verschijnt het bij hover of focus
        className={`absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg text-white/50 transition hover:bg-white/15 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 ${open ? "bg-white/15 text-white opacity-100" : "opacity-100 sm:opacity-0"}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <circle cx="7" cy="3" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="7" cy="11" r="1.3" />
        </svg>
      </button>

      {open ? (
        <div role="menu" aria-label={`Opties voor ${app.naam}`} className="absolute right-0 top-9 z-20 w-48 space-y-0.5 rounded-xl border border-white/15 bg-[#0C0E12]/97 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)]">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
          >
            Openen
          </button>
          <a role="menuitem" href={app.href} target="_blank" rel="noopener" className={item} onClick={() => setOpen(false)}>
            In een eigen tabblad
          </a>
          <button
            type="button"
            role="menuitem"
            disabled={eerste}
            className={item}
            onClick={() => {
              onVerplaats(-1);
              setOpen(false);
            }}
          >
            Naar voren
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={laatste}
            className={item}
            onClick={() => {
              onVerplaats(1);
              setOpen(false);
            }}
          >
            Naar achteren
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-amber-200`}
            onClick={() => {
              onAfhalen();
              setOpen(false);
            }}
          >
            Van bureaublad halen
          </button>
        </div>
      ) : null}
    </div>
  );
}
