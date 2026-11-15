"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// De foto's van een product groot, zoals bol.com (15 nov 2026): bladeren met de pijlen (ook op het toetsenbord), vegen op de
// telefoon, en inzoomen met een klik of tik op de plek waar je kijkt; ingezoomd volgt de foto de muis. Escape of × sluit, en
// de focus gaat terug naar de foto waarmee je hem opende.

export interface FotoViewerTeksten {
  sluiten: string;
  vorige: string;
  volgende: string;
  /** "Foto {n} van {total}" */
  fotoVan: string;
  inzoomen: string;
  uitzoomen: string;
}

const ZOOM = 2.5;
/** zoveel pixels vegen = naar de volgende foto */
const VEEG = 50;

export function FotoViewer({
  fotos,
  start,
  titel,
  teksten,
  onSluit,
}: {
  fotos: string[];
  start: number;
  titel: string;
  teksten: FotoViewerTeksten;
  onSluit: (index: number) => void;
}) {
  const [i, setI] = useState(Math.min(Math.max(0, start), Math.max(0, fotos.length - 1)));
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const sluitRef = useRef<HTMLButtonElement | null>(null);
  const veegStart = useRef<{ x: number; y: number } | null>(null);
  const meer = fotos.length > 1;

  const naar = (n: number) => {
    setZoom(null);
    setI((n + fotos.length) % fotos.length);
  };

  useEffect(() => {
    sluitRef.current?.focus();
    const vorigeOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorigeOverflow;
    };
  }, []);

  // toetsen: Escape sluit (via een vlag, zodat de huidige foto meegaat), pijlen bladeren
  const [sluit, setSluit] = useState(false);
  const aantal = fotos.length;
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSluit(true);
      else if (aantal > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        setZoom(null);
        setI((x) => (x + (e.key === "ArrowRight" ? 1 : -1) + aantal) % aantal);
      }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [aantal]);
  useEffect(() => {
    if (sluit) onSluit(i);
  }, [sluit, i, onSluit]);

  const plek = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const foto = fotos[i];

  return (
    <div role="dialog" aria-modal="true" aria-label={titel} className="fixed inset-0 z-[2000] flex flex-col bg-black/95 text-white">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <p className="text-[14px] font-semibold" aria-live="polite">
          {meer ? teksten.fotoVan.replace("{n}", String(i + 1)).replace("{total}", String(fotos.length)) : titel}
        </p>
        <button ref={sluitRef} type="button" onClick={() => onSluit(i)} aria-label={teksten.sluiten} className="grid h-11 w-11 place-items-center rounded-full text-[26px] leading-none hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          ×
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {foto && (
          <button
            type="button"
            aria-label={zoom ? teksten.uitzoomen : teksten.inzoomen}
            aria-pressed={zoom !== null}
            onClick={(e) => setZoom(zoom ? null : plek(e))}
            onMouseMove={(e) => {
              if (zoom) setZoom(plek(e));
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) veegStart.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const s = veegStart.current;
              const t = e.changedTouches[0];
              veegStart.current = null;
              if (!s || !t || zoom || !meer) return;
              const dx = t.clientX - s.x;
              if (Math.abs(dx) > VEEG && Math.abs(dx) > Math.abs(t.clientY - s.y)) {
                e.preventDefault();
                naar(dx < 0 ? i + 1 : i - 1);
              }
            }}
            className={`absolute inset-0 overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
          >
            <span
              className="absolute inset-0 transition-transform duration-200 ease-out"
              style={zoom ? { transform: `scale(${ZOOM})`, transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            >
              <Image src={foto} alt={i === 0 ? titel : ""} fill sizes="100vw" className="object-contain" />
            </span>
          </button>
        )}
        {meer && (
          <>
            <button type="button" onClick={() => naar(i - 1)} aria-label={teksten.vorige} className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-[24px] hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              ‹
            </button>
            <button type="button" onClick={() => naar(i + 1)} aria-label={teksten.volgende} className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-[24px] hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              ›
            </button>
          </>
        )}
      </div>

      {meer && (
        <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3">
          {fotos.map((src, n) => (
            <button
              key={src}
              type="button"
              onClick={() => naar(n)}
              aria-label={teksten.fotoVan.replace("{n}", String(n + 1)).replace("{total}", String(fotos.length))}
              aria-pressed={n === i}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${n === i ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <Image src={src} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
