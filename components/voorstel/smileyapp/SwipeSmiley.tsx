"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { gezichtKleur, mondPad } from "@/lib/voorstel/smileyapp-gezicht";

// "Probeer het zelf": het scherm van hun app (een vraag, een smiley die je
// swipet, een cijfer en "Volgende") als speelse demo in de hero. Slepen over de
// smiley of het schuifje eronder (ook met het toetsenbord). Een voorbeeld: er
// wordt niets opgeslagen of verstuurd. Zonder "minder beweging" laat de smiley
// één keer zien hoe hij van boos naar blij gaat, tot de bezoeker zelf iets doet.

const TEASER = [6, 5, 4, 3, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 9];
const CONFETTI = [
  { l: 6, k: "#5ABA8E", d: 0, x: "-30px" },
  { l: 14, k: "#FDD11A", d: 0.15, x: "20px" },
  { l: 22, k: "#F0705F", d: 0.05, x: "-12px" },
  { l: 30, k: "#5ABA8E", d: 0.3, x: "26px" },
  { l: 38, k: "#0E2A20", d: 0.1, x: "-20px" },
  { l: 46, k: "#FDD11A", d: 0.25, x: "14px" },
  { l: 54, k: "#5ABA8E", d: 0.05, x: "-28px" },
  { l: 62, k: "#F0705F", d: 0.35, x: "22px" },
  { l: 70, k: "#FDD11A", d: 0.12, x: "-10px" },
  { l: 78, k: "#5ABA8E", d: 0.22, x: "30px" },
  { l: 86, k: "#0E2A20", d: 0.08, x: "-24px" },
  { l: 93, k: "#FDD11A", d: 0.28, x: "12px" },
] as const;

const binnen = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

export function SwipeSmiley({ vraag }: { vraag: string }) {
  const [score, setScore] = useState(7);
  const [klaar, setKlaar] = useState(false);
  const [aangeraakt, setAangeraakt] = useState(false);
  const sleep = useRef<{ x: number; start: number } | null>(null);
  const kleur = gezichtKleur(score);

  useEffect(() => {
    if (aangeraakt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const stap = () => {
      const v = TEASER[i];
      if (v === undefined) return;
      setScore(v);
      i += 1;
      t = setTimeout(stap, 170);
    };
    t = setTimeout(stap, 1100);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [aangeraakt]);

  function begin(e: PointerEvent<HTMLDivElement>) {
    setAangeraakt(true);
    sleep.current = { x: e.clientX, start: score };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function beweeg(e: PointerEvent<HTMLDivElement>) {
    const s = sleep.current;
    if (s) setScore(binnen(s.start + (e.clientX - s.x) / 16));
  }
  function los() {
    sleep.current = null;
  }

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="relative rounded-[2.75rem] bg-[#06150F] p-2.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75)] ring-1 ring-white/15">
        <div className="relative overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-smiley-green to-[#3E9A70] px-4 pb-7 pt-11">
          <div aria-hidden="true" className="absolute left-1/2 top-2.5 h-5 w-24 -translate-x-1/2 rounded-full bg-[#06150F]" />
          <div className="relative rounded-[1.6rem] bg-white p-5 text-center text-smiley-ink shadow-lg">
            {klaar ? (
              <div role="status" className="relative py-4">
                <div className="sm-confetti" aria-hidden="true">
                  {CONFETTI.map((c) => (
                    <span key={c.l} style={{ left: `${c.l}%`, background: c.k, animationDelay: `${c.d}s`, ["--sm-x" as string]: c.x }} />
                  ))}
                </div>
                <p className="font-display text-3xl font-bold">Bedankt!</p>
                <svg viewBox="0 0 100 100" className="mx-auto mt-4 h-28 w-28" aria-hidden="true">
                  <circle cx="50" cy="50" r="41" fill="none" stroke="#5ABA8E" strokeWidth="8" />
                  <circle cx="36" cy="40" r="5.5" fill="#5ABA8E" />
                  <circle cx="64" cy="40" r="5.5" fill="#5ABA8E" />
                  <path d={mondPad(10)} fill="none" stroke="#5ABA8E" strokeWidth="7" strokeLinecap="round" />
                </svg>
                <p className="mt-3 text-sm font-semibold text-smiley-mute">Je gaf een {score} van 10.</p>
                <button
                  type="button"
                  onClick={() => {
                    setKlaar(false);
                    setScore(7);
                  }}
                  className="mt-5 w-full rounded-full bg-smiley-ink py-3 text-sm font-bold text-white"
                >
                  Nog een keer
                </button>
              </div>
            ) : (
              <>
                <p className="text-left text-[15px] font-bold leading-snug">{vraag}</p>
                <div
                  aria-hidden="true"
                  onPointerDown={begin}
                  onPointerMove={beweeg}
                  onPointerUp={los}
                  onPointerCancel={los}
                  className="relative mx-auto mt-4 aspect-square w-36 cursor-grab touch-pan-y select-none active:cursor-grabbing"
                >
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    <circle cx="50" cy="50" r="41" fill={`${kleur}1F`} stroke={kleur} strokeWidth="8" style={{ transition: "stroke 0.2s, fill 0.2s" }} />
                    <circle className="sm-oog sm-knipoog" cx="36" cy="40" r="5.5" fill={kleur} />
                    <circle className="sm-oog sm-knipoog" cx="64" cy="40" r="5.5" fill={kleur} />
                    <path d={mondPad(score)} fill="none" stroke={kleur} strokeWidth="7" strokeLinecap="round" style={{ transition: "d 0.15s" }} />
                  </svg>
                  {!aangeraakt && (
                    <span className="sm-hint absolute -bottom-2 left-1/2 -ml-8 w-16 rounded-full bg-smiley-ink py-1 text-[11px] font-bold text-white">swipe</span>
                  )}
                </div>
                <p className="mt-2 font-display text-5xl font-bold tabular-nums" aria-hidden="true">
                  {score}
                </p>
                <label htmlFor="sm-swipe-score" className="sr-only">
                  {vraag} Kies een cijfer van 1 tot 10.
                </label>
                <input
                  id="sm-swipe-score"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={score}
                  aria-valuetext={`${score} van 10`}
                  onChange={(e) => {
                    setAangeraakt(true);
                    setScore(binnen(Number(e.target.value)));
                  }}
                  className="sm-schuif mt-3 w-full"
                />
                <div aria-hidden="true" className="mt-1.5 flex justify-between text-[11px] font-bold text-smiley-mute">
                  <span>1</span>
                  <span>10</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAangeraakt(true);
                    setKlaar(true);
                  }}
                  className="mt-4 w-full rounded-full bg-smiley-green py-3 text-sm font-bold text-smiley-ink transition-transform hover:-translate-y-0.5"
                >
                  Volgende
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs font-semibold text-white/70">Probeer het zelf: swipe de smiley. Een voorbeeld, er wordt niets opgeslagen.</p>
    </div>
  );
}
