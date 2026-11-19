"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { gezichtKleur, mondPad } from "@/lib/voorstel/smileyapp-gezicht";

// "Probeer het zelf" op de voorpagina: een voorbeeldvraag, de smiley swipen,
// en daarna een klein voorbeeld-dashboard waarin je eigen antwoord tussen
// voorbeeldstaafjes staat. Alles gebeurt in de browser: er wordt niets bewaard
// en niets verstuurd. De staafjes zijn verzonnen voorbeeldcijfers en heten ook
// zo; ze zeggen niets over echte klanten. Bedienen kan door te slepen, met de
// pijltjestoetsen (de smiley is een schuifregelaar) of met de rij knoppen. De
// beweging van de staafjes staat uit bij "minder beweging" (motion-safe).

const CIJFERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Voorbeeld: hoe vaak elk cijfer in dit verzonnen dashboard gegeven is (van 1 tot en met 10). */
const VOORBEELD = [1, 0, 1, 2, 3, 5, 9, 14, 11, 6] as const;

const binnen = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

export function ProbeerZelf({ vraag }: { vraag: string }) {
  const [score, setScore] = useState(7);
  const [verstuurd, setVerstuurd] = useState(false);
  const sleep = useRef<{ x: number; start: number } | null>(null);
  const kleur = gezichtKleur(score);

  function begin(e: PointerEvent<HTMLDivElement>) {
    sleep.current = { x: e.clientX, start: score };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function beweeg(e: PointerEvent<HTMLDivElement>) {
    const s = sleep.current;
    if (s) setScore(binnen(s.start + (e.clientX - s.x) / 18));
  }
  function los() {
    sleep.current = null;
  }
  function toets(e: KeyboardEvent<HTMLDivElement>) {
    const stap: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (Object.hasOwn(stap, e.key)) setScore((s) => binnen(s + (stap[e.key] ?? 0)));
    else if (e.key === "Home") setScore(1);
    else if (e.key === "End") setScore(10);
    else return;
    e.preventDefault();
  }

  // het voorbeeld plus jouw ene antwoord
  const aantallen = VOORBEELD.map((n, i) => n + (verstuurd && i + 1 === score ? 1 : 0));
  const hoogste = Math.max(...aantallen, 1);
  const totaal = aantallen.reduce((a, b) => a + b, 0);
  const gemiddelde = aantallen.reduce((som, n, i) => som + n * (i + 1), 0) / totaal;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* de vraag */}
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-45px_rgba(14,42,32,0.5)] ring-1 ring-smiley-ink/10 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-leaf">Voorbeeldvraag</p>
        <p id="sm-probeer-vraag" className="mt-2 font-display text-2xl font-bold leading-tight">
          {vraag}
        </p>
        <div
          role="slider"
          tabIndex={0}
          aria-labelledby="sm-probeer-vraag"
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={score}
          aria-valuetext={`${score} van 10`}
          onKeyDown={toets}
          onPointerDown={begin}
          onPointerMove={beweeg}
          onPointerUp={los}
          onPointerCancel={los}
          className="mx-auto mt-6 flex w-fit cursor-grab touch-pan-y select-none items-center gap-5 rounded-[2rem] px-4 py-2 outline-none focus-visible:ring-4 focus-visible:ring-smiley-leaf/50 active:cursor-grabbing"
        >
          <svg viewBox="0 0 100 100" className="h-32 w-32 sm:h-36 sm:w-36" aria-hidden="true">
            <circle cx="50" cy="50" r="41" fill={`${kleur}1F`} stroke={kleur} strokeWidth="8" />
            <circle cx="36" cy="40" r="5.5" fill={kleur} />
            <circle cx="64" cy="40" r="5.5" fill={kleur} />
            <path d={mondPad(score)} fill="none" stroke={kleur} strokeWidth="7" strokeLinecap="round" />
          </svg>
          <span aria-hidden="true" className="w-16 text-center font-display text-6xl font-bold tabular-nums">
            {score}
          </span>
        </div>
        <p className="mt-2 text-center text-sm text-smiley-mute">Sleep de smiley naar links of rechts, gebruik de pijltjestoetsen of kies een cijfer.</p>
        {/* de knoppenrij: hetzelfde antwoord zonder slepen */}
        <div role="group" aria-label="Kies een cijfer van 1 tot 10" className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {CIJFERS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              onClick={() => setScore(n)}
              className={`h-11 rounded-full text-sm font-bold ring-1 transition-colors ${score === n ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-smiley-cream text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setVerstuurd(true)} className="rounded-full bg-smiley-green px-7 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
            {verstuurd ? "Antwoord aanpassen" : "Geef dit antwoord"}
          </button>
          {verstuurd && (
            <button type="button" onClick={() => setVerstuurd(false)} className="rounded-full px-5 py-3 text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
              Opnieuw
            </button>
          )}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-smiley-mute">Een voorbeeld: je antwoord blijft in je eigen browser, er wordt niets bewaard of verstuurd.</p>
      </div>

      {/* het voorbeeld-dashboard */}
      <div className="rounded-[2rem] bg-smiley-ink p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl font-bold">Zo ziet het er in je dashboard uit</p>
          <span className="rounded-full bg-smiley-sun px-3 py-1 text-xs font-bold uppercase tracking-wider text-smiley-ink">Voorbeeld</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/75">De staafjes zijn voorbeeldcijfers, geen echte resultaten. Jouw antwoord komt erbij zodra je het geeft.</p>
        <div role="status" className="mt-5 min-h-[3.5rem]">
          {verstuurd ? (
            <p className="rounded-2xl bg-white/10 p-3 text-sm font-semibold">
              Jouw antwoord, een <span className="text-smiley-sun">{score}</span>, staat erbij. Gemiddelde in dit voorbeeld: {gemiddelde.toFixed(1).replace(".", ",")} uit {totaal} antwoorden.
            </p>
          ) : (
            <p className="rounded-2xl bg-white/5 p-3 text-sm text-white/75">Geef links je antwoord en kijk wat er gebeurt.</p>
          )}
        </div>
        <ol aria-label="Voorbeeld: aantal antwoorden per cijfer" className="mt-5 grid h-44 grid-cols-10 items-end gap-1.5 sm:gap-2.5">
          {aantallen.map((n, i) => {
            const mijn = verstuurd && i + 1 === score;
            return (
              <li key={i} className="relative flex h-full min-w-0 flex-col items-center gap-1.5">
                <span aria-hidden="true" className={`text-[11px] font-bold tabular-nums ${mijn ? "text-smiley-sun" : "text-white/60"}`}>
                  {n}
                </span>
                <span className="flex w-full flex-1 items-end">
                  <span
                    className={`block w-full rounded-t-lg motion-safe:transition-[height,background-color] motion-safe:duration-500 ${mijn ? "bg-smiley-sun" : "bg-smiley-green/70"}`}
                    style={{ height: `${Math.max(3, Math.round((n / hoogste) * 100))}%` }}
                  />
                </span>
                <span className="sr-only">
                  Cijfer {i + 1}: {n} {n === 1 ? "antwoord" : "antwoorden"}
                  {mijn ? ", waaronder dat van jou" : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <div aria-hidden="true" className="mt-2 grid grid-cols-10 gap-1.5 text-center text-xs font-bold text-white/70 sm:gap-2.5">
          {CIJFERS.map((n) => (
            <span key={n} className={verstuurd && n === score ? "text-smiley-sun" : ""}>
              {n}
            </span>
          ))}
        </div>
        {verstuurd && <p className="mt-4 text-sm font-semibold text-smiley-sun">Het gele staafje is jouw antwoord.</p>}
      </div>
    </div>
  );
}
