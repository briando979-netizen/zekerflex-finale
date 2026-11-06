"use client";

import { useEffect, useRef, useState } from "react";
import type { OsApp, OsTint } from "@/lib/os/apps";
import { OsIcoonVak } from "@/components/os/Iconen";

// ---------------------------------------------------------------------------
// Eén venster in ZekerFlex OS. De inhoud is de echte pagina in een frame van
// dezelfde site (same-origin, de CSP staat alleen 'self' toe). Verslepen aan
// de titelbalk, formaat wijzigen rechtsonder, en knoppen voor kleiner,
// groter en sluiten. Op een smal scherm vult een venster altijd het beeld.
// ---------------------------------------------------------------------------

export interface VensterStaat {
  /** app-id; één venster per app */
  id: string;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  /** hoger = meer naar voren */
  laag: number;
  minimaal: boolean;
  maximaal: boolean;
}

export interface VensterActies {
  naarVoren: (id: string) => void;
  verplaats: (id: string, x: number, y: number) => void;
  formaat: (id: string, breedte: number, hoogte: number) => void;
  minimaliseer: (id: string) => void;
  maximaliseer: (id: string) => void;
  sluit: (id: string) => void;
}

export const MIN_BREEDTE = 360;
export const MIN_HOOGTE = 260;
/** hoogte van de taakbalk; vensters blijven erboven */
export const TAAKBALK = 56;

function KnopVak({ titel, onClick, children }: { titel: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={titel} title={titel} className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}

export function Venster({ app, tint, staat, acties, smal, actief }: { app: OsApp; tint: OsTint; staat: VensterStaat; acties: VensterActies; smal: boolean; actief: boolean }) {
  const [sleep, setSleep] = useState<{ dx: number; dy: number } | null>(null);
  const [rek, setRek] = useState<{ x: number; y: number; b: number; h: number } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const titelId = `venster-${staat.id}-titel`;

  // slepen en formaat wijzigen volgen de muis op het hele scherm, ook boven het frame
  useEffect(() => {
    if (!sleep && !rek) return;
    const beweeg = (e: PointerEvent) => {
      if (sleep) acties.verplaats(staat.id, e.clientX - sleep.dx, Math.max(0, e.clientY - sleep.dy));
      else if (rek) acties.formaat(staat.id, Math.max(MIN_BREEDTE, rek.b + (e.clientX - rek.x)), Math.max(MIN_HOOGTE, rek.h + (e.clientY - rek.y)));
    };
    const stop = () => {
      setSleep(null);
      setRek(null);
    };
    window.addEventListener("pointermove", beweeg);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", beweeg);
      window.removeEventListener("pointerup", stop);
    };
  }, [sleep, rek, acties, staat.id]);

  if (staat.minimaal) return null;

  const vol = smal || staat.maximaal;
  const stijl: React.CSSProperties = vol
    ? { left: 0, top: 0, width: "100%", height: `calc(100% - ${TAAKBALK}px)`, zIndex: staat.laag }
    : { left: staat.x, top: staat.y, width: staat.breedte, height: staat.hoogte, zIndex: staat.laag };

  return (
    <section
      aria-labelledby={titelId}
      onPointerDown={() => acties.naarVoren(staat.id)}
      style={stijl}
      className={`absolute flex flex-col overflow-hidden rounded-2xl border bg-[#0C0E12] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ${actief ? "border-white/20" : "border-white/10"}`}
    >
      <header
        onPointerDown={(e) => {
          if (vol || (e.target as HTMLElement).closest("button")) return;
          setSleep({ dx: e.clientX - staat.x, dy: e.clientY - staat.y });
        }}
        onDoubleClick={() => !smal && acties.maximaliseer(staat.id)}
        className={`flex flex-shrink-0 items-center gap-2.5 border-b border-white/10 px-3 py-2 ${vol ? "" : "cursor-grab active:cursor-grabbing"}`}
      >
        <OsIcoonVak icoon={app.icoon} tint={tint} maat="klein" />
        <span className="min-w-0 flex-1">
          <span id={titelId} className="block truncate text-sm font-semibold text-white">
            {app.naam}
          </span>
          <span className="block truncate text-[11px] text-white/45">{app.href}</span>
        </span>
        <KnopVak
          titel="Opnieuw laden"
          onClick={() => {
            // eigen frame, dus dit mag; bij een andere herkomst doet de browser niets
            try {
              frame.current?.contentWindow?.location.reload();
            } catch {
              if (frame.current) frame.current.src = app.href;
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
          </svg>
        </KnopVak>
        <a
          href={app.href}
          target="_blank"
          rel="noopener"
          title="In een eigen tabblad openen"
          aria-label={`${app.naam} in een eigen tabblad openen`}
          className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
        <KnopVak titel="Kleiner" onClick={() => acties.minimaliseer(staat.id)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 9h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </KnopVak>
        {smal ? null : (
          <KnopVak titel={staat.maximaal ? "Verklein" : "Volledig scherm"} onClick={() => acties.maximaliseer(staat.id)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </KnopVak>
        )}
        <KnopVak titel="Sluiten" onClick={() => acties.sluit(staat.id)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="m4 4 6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </KnopVak>
      </header>

      <div className="relative flex-1 bg-white">
        <iframe ref={frame} src={app.href} title={app.naam} className="h-full w-full border-0" />
        {/* tijdens slepen vangt dit laagje de muis op, anders slikt het frame de beweging */}
        {sleep || rek ? <div className="absolute inset-0" /> : null}
      </div>

      {vol ? null : (
        <button
          type="button"
          aria-label={`${app.naam}: formaat wijzigen`}
          onPointerDown={(e) => {
            e.preventDefault();
            setRek({ x: e.clientX, y: e.clientY, b: staat.breedte, h: staat.hoogte });
          }}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize text-white/40 hover:text-white/70"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path d="M15 7 7 15M17 12l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </section>
  );
}
