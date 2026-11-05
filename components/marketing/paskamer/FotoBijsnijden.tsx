"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";

// Je gezicht in het ovaal van de paspop zetten: slepen, knijpen of scrollen om
// te zoomen, schuiven om te draaien, en de ogen op de lijn. Alles gebeurt in de
// browser: de foto wordt hier bijgesneden tot een kleine JPEG (320 × 400) en
// gaat nergens heen. Uit de wangen nemen we meteen de huidskleur voor de paspop.

const FRAME = { w: 240, h: 300 } as const; // zelfde verhouding als het hoofd (0,8)
const UIT = { w: 320, h: 400 } as const;

type Punt = { x: number; y: number };

export function FotoBijsnijden({ bestand, t, onKlaar, onAnnuleer }: { bestand: File; t: Dict["paskamer"]; onKlaar: (foto: string, huid: string | null) => void; onAnnuleer: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fout, setFout] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [draai, setDraai] = useState(0);
  const [pos, setPos] = useState<Punt>({ x: 0, y: 0 });
  const vingers = useRef(new Map<number, Punt>());
  const knijp = useRef<{ afstand: number; zoom: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(bestand);
    setUrl(u);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setFout(true);
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [bestand]);

  useEffect(() => {
    frameRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onAnnuleer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnnuleer]);

  const basis = img ? Math.max(FRAME.w / img.naturalWidth, FRAME.h / img.naturalHeight) : 1;
  const schaal = basis * zoom;
  const zetZoom = (z: number) => setZoom(Math.min(4, Math.max(1, z)));

  const neer = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    vingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (vingers.current.size === 2) {
      const [a, b] = [...vingers.current.values()];
      if (a && b) knijp.current = { afstand: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const beweeg = (e: PointerEvent<HTMLDivElement>) => {
    const vorig = vingers.current.get(e.pointerId);
    if (!vorig) return;
    const nu = { x: e.clientX, y: e.clientY };
    vingers.current.set(e.pointerId, nu);
    if (vingers.current.size === 2 && knijp.current) {
      const [a, b] = [...vingers.current.values()];
      if (a && b) zetZoom(knijp.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / (knijp.current.afstand || 1)));
      return;
    }
    setPos((p) => ({ x: p.x + nu.x - vorig.x, y: p.y + nu.y - vorig.y }));
  };
  const op = (e: PointerEvent<HTMLDivElement>) => {
    vingers.current.delete(e.pointerId);
    if (vingers.current.size < 2) knijp.current = null;
  };
  const wiel = (e: WheelEvent<HTMLDivElement>) => zetZoom(zoom * (1 - e.deltaY * 0.0015));
  const toets = (e: KeyboardEvent<HTMLDivElement>) => {
    const stap = e.shiftKey ? 24 : 8;
    const zet: Record<string, () => void> = {
      ArrowLeft: () => setPos((p) => ({ ...p, x: p.x - stap })),
      ArrowRight: () => setPos((p) => ({ ...p, x: p.x + stap })),
      ArrowUp: () => setPos((p) => ({ ...p, y: p.y - stap })),
      ArrowDown: () => setPos((p) => ({ ...p, y: p.y + stap })),
      "+": () => zetZoom(zoom * 1.08),
      "=": () => zetZoom(zoom * 1.08),
      "-": () => zetZoom(zoom / 1.08),
    };
    const actie = zet[e.key];
    if (!actie) return;
    e.preventDefault();
    actie();
  };

  const klaar = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = UIT.w;
    c.height = UIT.h;
    const ctx = c.getContext("2d");
    if (!ctx) return setFout(true);
    const k = UIT.w / FRAME.w;
    ctx.fillStyle = "#d9cfc4";
    ctx.fillRect(0, 0, UIT.w, UIT.h);
    ctx.translate(UIT.w / 2 + pos.x * k, UIT.h / 2 + pos.y * k);
    ctx.rotate((draai * Math.PI) / 180);
    const w = img.naturalWidth * schaal * k;
    const h = img.naturalHeight * schaal * k;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    onKlaar(c.toDataURL("image/jpeg", 0.85), huidUit(ctx));
  };

  // het ovaal van het hoofd en de ooglijn, in framecoördinaten (zie Paspop: foto = 1,02 × het ovaal)
  const rx = FRAME.w / 2 / 1.02;
  const ry = FRAME.h / 2 / 1.02;
  const ogen = FRAME.h / 2 - ry * 0.1;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="pk-bijsnijden">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-e2">
        <h2 id="pk-bijsnijden" className="font-display text-[19px] font-bold text-ink">
          {t.bijsnijdenTitel}
        </h2>
        <p className="mt-1 text-[13px] text-neutralx-600">{t.bijsnijdenUitleg}</p>

        {fout ? (
          <p role="alert" className="mt-5 rounded-lg bg-crit/10 px-3 py-2.5 text-[14px] font-semibold text-crit">
            {t.fotoFout}
          </p>
        ) : (
          <div
            ref={frameRef}
            tabIndex={0}
            role="application"
            aria-label={t.bijsnijdenUitleg}
            onPointerDown={neer}
            onPointerMove={beweeg}
            onPointerUp={op}
            onPointerCancel={op}
            onWheel={wiel}
            onKeyDown={toets}
            className="relative mx-auto mt-4 cursor-grab touch-none select-none overflow-hidden rounded-xl bg-paper-200 outline-none ring-brand-500 focus-visible:ring-2 active:cursor-grabbing"
            style={{ width: FRAME.w, height: FRAME.h }}
          >
            {url && img && (
              // eslint-disable-next-line @next/next/no-img-element -- een lokale blob, geen optimalisatie nodig
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{ width: img.naturalWidth * schaal, height: img.naturalHeight * schaal, transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${draai}deg)` }}
              />
            )}
            <svg className="pointer-events-none absolute inset-0" width={FRAME.w} height={FRAME.h} aria-hidden>
              <path d={`M0,0 H${FRAME.w} V${FRAME.h} H0 Z M${FRAME.w / 2 - rx},${FRAME.h / 2} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`} fill="rgba(12,14,18,0.55)" fillRule="evenodd" />
              <ellipse cx={FRAME.w / 2} cy={FRAME.h / 2} rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="5 4" />
              <line x1={FRAME.w / 2 - rx * 0.78} x2={FRAME.w / 2 + rx * 0.78} y1={ogen} y2={ogen} stroke="#4fe0a0" strokeWidth="1.5" />
              <text x={FRAME.w / 2 + rx * 0.8 + 4} y={ogen + 4} fill="#4fe0a0" fontSize="11" fontWeight="700">
                {t.ogen}
              </text>
            </svg>
          </div>
        )}

        {!fout && (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-[13px] font-semibold text-ink">
              <span className="w-20 shrink-0">{t.zoom}</span>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => zetZoom(Number(e.target.value))} className="w-full accent-brand-500" />
            </label>
            <label className="flex items-center gap-3 text-[13px] font-semibold text-ink">
              <span className="w-20 shrink-0">{t.draai}</span>
              <input type="range" min={-30} max={30} step={1} value={draai} onChange={(e) => setDraai(Number(e.target.value))} className="w-full accent-brand-500" />
            </label>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onAnnuleer} className="h-11 flex-1 rounded-lg border border-hairstrong text-[14px] font-semibold text-ink hover:bg-paper-soft">
            {t.annuleer}
          </button>
          <button type="button" onClick={klaar} disabled={!img || fout} className="h-11 flex-[1.5] rounded-lg bg-brand-500 text-[14px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">
            {t.gebruik}
          </button>
        </div>
        <p className="mt-3 text-center text-[12px] text-neutralx-500">{t.privacy}</p>
      </div>
    </div>
  );
}

/** Gemiddelde kleur van de wangen (onder de ogen, naast de neus), iets gedempt; null als het niet lukt. */
function huidUit(ctx: CanvasRenderingContext2D): string | null {
  try {
    const vlakken = [
      [0.26, 0.58, 0.14, 0.1],
      [0.6, 0.58, 0.14, 0.1],
    ] as const;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const [x, y, w, h] of vlakken) {
      const d = ctx.getImageData(Math.round(x * UIT.w), Math.round(y * UIT.h), Math.round(w * UIT.w), Math.round(h * UIT.h)).data;
      for (let i = 0; i < d.length; i += 16) {
        r += d[i] ?? 0;
        g += d[i + 1] ?? 0;
        b += d[i + 2] ?? 0;
        n++;
      }
    }
    if (n === 0) return null;
    const hex = (v: number) => Math.round(Math.min(255, (v / n) * 0.96)).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}
