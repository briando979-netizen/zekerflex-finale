"use client";

import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { gezichtKleur, mondPad } from "@/lib/voorstel/smileyapp-gezicht";
import { EIGEN_MAX, KEUZE_MAX, LEGE_KEUZE, isLeeg, keuzeNaarZoek, schoonEigen, wisselVraag, type Keuze, type SoortSleutel } from "@/lib/voorstel/smileyapp-samensteller";
import { SAMENSTEL_NL, vul, type SamenstelTeksten } from "@/lib/voorstel/smileyapp-teksten";

// "Stel je eigen vragenlijst samen" (deel 6b): links kiest de bezoeker hooguit
// vijf voorbeeldvragen en typt er als hij wil één eigen vraag bij; ernaast (op
// de telefoon eronder) staat het scherm van de app op een telefoon, waar hij
// vraag voor vraag doorheen tikt. De smiley swipet zoals in SwipeSmiley; een
// ja/nee-vraag heeft twee knoppen en een open vraag een tekstvak, zodat elk
// soort vraag eruitziet zoals hij is. Alles gebeurt in de browser: er wordt
// niets bewaard en niets verstuurd. Pas de knop onderaan neemt de keuze mee
// naar de demo-aanvraag, in de adresbalk (alleen id's van vaste vragen en de
// eigen vraag). De vragen en de teksten komen als gewone gegevens van de pagina.

export interface SamenstelVraag {
  id: string;
  /** de naam van de branche waar de voorbeeldvraag bij hoort */
  groep: string;
  soort: SoortSleutel;
  tekst: string;
}

interface Stap {
  id: string;
  soort: SoortSleutel;
  tekst: string;
}

const binnen = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-smiley-cream px-4 py-3 text-base text-smiley-ink ring-1 ring-smiley-ink/15 focus:outline-none focus:ring-2 focus:ring-smiley-leaf";

/** Het antwoordvak van één vraag op de telefoon: de smiley, ja/nee of een tekstvak. */
function Antwoord({ stap, t }: { stap: Stap; t: SamenstelTeksten }) {
  const [score, setScore] = useState(7);
  const [janee, setJanee] = useState<"ja" | "nee" | "">("");
  const [tekst, setTekst] = useState("");
  const sleep = useRef<{ x: number; start: number } | null>(null);
  const veld = `sm-samen-${stap.id}`;

  if (stap.soort === "rating") {
    const kleur = gezichtKleur(score);
    const begin = (e: PointerEvent<HTMLDivElement>) => {
      sleep.current = { x: e.clientX, start: score };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const beweeg = (e: PointerEvent<HTMLDivElement>) => {
      const s = sleep.current;
      if (s) setScore(binnen(s.start + (e.clientX - s.x) / 16));
    };
    const los = () => {
      sleep.current = null;
    };
    return (
      <>
        <div aria-hidden="true" onPointerDown={begin} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} className="mx-auto mt-4 aspect-square w-32 cursor-grab touch-pan-y select-none active:cursor-grabbing">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <circle cx="50" cy="50" r="41" fill={`${kleur}1F`} stroke={kleur} strokeWidth="8" />
            <circle className="sm-oog" cx="36" cy="40" r="5.5" fill={kleur} />
            <circle className="sm-oog" cx="64" cy="40" r="5.5" fill={kleur} />
            <path d={mondPad(score)} fill="none" stroke={kleur} strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mt-1 font-display text-4xl font-bold tabular-nums" aria-hidden="true">
          {score}
        </p>
        <label htmlFor={veld} className="sr-only">
          {stap.tekst} {t.kiesCijfer}
        </label>
        <input id={veld} type="range" min={1} max={10} step={1} value={score} aria-valuetext={vul(t.score, { score })} onChange={(e) => setScore(binnen(Number(e.target.value)))} className="sm-schuif mt-3 w-full" />
        <div aria-hidden="true" className="mt-1.5 flex justify-between text-[11px] font-bold text-smiley-mute">
          <span>1</span>
          <span>10</span>
        </div>
      </>
    );
  }

  if (stap.soort === "janee") {
    return (
      <div role="group" aria-label={stap.tekst} className="mt-6 grid grid-cols-2 gap-2">
        {(["ja", "nee"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={janee === k}
            onClick={() => setJanee(k)}
            className={`rounded-full py-3 text-sm font-bold ring-1 transition-colors ${janee === k ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-smiley-cream text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
          >
            {k === "ja" ? t.ja : t.nee}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <label htmlFor={veld} className="sr-only">
        {stap.tekst}
      </label>
      <textarea id={veld} rows={4} maxLength={300} value={tekst} placeholder={t.antwoord} onChange={(e) => setTekst(e.target.value)} className={`${VELD} mt-4 text-left text-sm`} />
    </>
  );
}

/** Het scherm van de app op een telefoon: één vraag tegelijk, met Vorige en Volgende, en aan het eind "Bedankt!". */
function Telefoon({ stappen, start, t }: { stappen: readonly Stap[]; start: number; t: SamenstelTeksten }) {
  const [index, setIndex] = useState(start);
  const [klaar, setKlaar] = useState(false);
  const i = Math.min(Math.max(index, 0), Math.max(stappen.length - 1, 0));
  const stap = stappen[i];
  const laatste = i === stappen.length - 1;

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="relative rounded-[2.75rem] bg-[#06150F] p-2.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75)] ring-1 ring-white/15">
        <div className="relative overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-smiley-green to-[#3E9A70] px-4 pb-7 pt-11">
          <div aria-hidden="true" className="absolute left-1/2 top-2.5 h-5 w-24 -translate-x-1/2 rounded-full bg-[#06150F]" />
          <div className="relative min-h-[21rem] rounded-[1.6rem] bg-white p-5 text-center text-smiley-ink shadow-lg">
            {!stap ? (
              <p className="pt-24 text-sm font-semibold leading-relaxed text-smiley-mute">{t.leeg}</p>
            ) : klaar ? (
              <div role="status" className="py-4">
                <p className="font-display text-3xl font-bold">{t.bedankt}</p>
                <svg viewBox="0 0 100 100" className="mx-auto mt-4 h-28 w-28" aria-hidden="true">
                  <circle cx="50" cy="50" r="41" fill="none" stroke="#5ABA8E" strokeWidth="8" />
                  <circle cx="36" cy="40" r="5.5" fill="#5ABA8E" />
                  <circle cx="64" cy="40" r="5.5" fill="#5ABA8E" />
                  <path d={mondPad(10)} fill="none" stroke="#5ABA8E" strokeWidth="7" strokeLinecap="round" />
                </svg>
                <button
                  type="button"
                  onClick={() => {
                    setKlaar(false);
                    setIndex(0);
                  }}
                  className="mt-6 w-full rounded-full bg-smiley-ink py-3 text-sm font-bold text-white"
                >
                  {t.opnieuw}
                </button>
              </div>
            ) : (
              <>
                <p aria-live="polite" className="text-left text-[11px] font-bold uppercase tracking-wider text-smiley-leaf">
                  {vul(t.stap, { n: i + 1, totaal: stappen.length })}
                </p>
                <p className="mt-2 break-words text-left text-[15px] font-bold leading-snug [hyphens:auto]">{stap.tekst}</p>
                {/* key: elk antwoordvak begint leeg bij een andere vraag */}
                <Antwoord key={stap.id} stap={stap} t={t} />
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button type="button" disabled={i === 0} onClick={() => setIndex(i - 1)} className="rounded-full py-3 text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint disabled:opacity-40">
                    {t.vorige}
                  </button>
                  <button type="button" onClick={() => (laatste ? setKlaar(true) : setIndex(i + 1))} className="rounded-full bg-smiley-green py-3 text-sm font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
                    {laatste ? t.klaar : t.volgende}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** de voorbeeldvragen, in de taal van de pagina (lib/voorstel/smileyapp-samensteller.ts, KEUZEVRAGEN) */
  vragen: readonly SamenstelVraag[];
  /** het adres van de demo-aanvraag in de taal van de pagina */
  demoPad: string;
  /** een keuze uit de adresbalk (de link van een branchepagina), al opgeschoond door de pagina */
  begin?: Keuze;
  /** de teksten; zonder: Nederlands */
  teksten?: SamenstelTeksten;
}

export function Samensteller({ vragen, demoPad, begin = LEGE_KEUZE, teksten: t = SAMENSTEL_NL }: Props) {
  const [keuze, setKeuze] = useState<Keuze>(begin);
  /** de vraag die het laatst is aangezet: de telefoon springt daar naartoe */
  const [laatst, setLaatst] = useState("");
  const groepen = [...new Set(vragen.map((v) => v.groep))];
  const vol = keuze.ids.length >= KEUZE_MAX;
  const eigen = schoonEigen(keuze.eigen);

  const stappen: Stap[] = [
    ...keuze.ids.flatMap((id) => {
      const v = vragen.find((x) => x.id === id);
      return v ? [{ id: v.id, soort: v.soort, tekst: v.tekst }] : [];
    }),
    ...(eigen ? [{ id: "eigen", soort: "rating" as const, tekst: eigen }] : []),
  ];
  const start = Math.max(0, stappen.findIndex((s) => s.id === laatst));
  const zoek = keuzeNaarZoek({ ids: keuze.ids, eigen });

  function wissel(id: string) {
    setLaatst(keuze.ids.includes(id) ? "" : id);
    setKeuze((k) => wisselVraag(k, id));
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">{t.kiesKop}</h2>
          <p aria-live="polite" className="rounded-full bg-smiley-ink px-4 py-1.5 text-sm font-bold text-white">
            {vul(t.gekozen, { n: keuze.ids.length, max: KEUZE_MAX })}
          </p>
        </div>
        <p className="mt-4 rounded-2xl bg-smiley-sun/40 p-4 text-sm font-semibold leading-relaxed text-smiley-ink">
          <span className="mr-2 inline-flex rounded-full bg-smiley-sun px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">{t.voorbeeld}</span>
          {t.voorbeeldUitleg}
        </p>
        {vol && <p className="mt-3 text-sm font-semibold text-smiley-leaf">{vul(t.vol, { max: KEUZE_MAX })}</p>}

        <div className="mt-6 space-y-3">
          {groepen.map((groep, g) => (
            <details key={groep} open={g === 0 || vragen.some((v) => v.groep === groep && begin.ids.includes(v.id))} className="group rounded-[1.5rem] bg-white ring-1 ring-smiley-ink/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 break-words">{groep}</span>
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-smiley-mint text-smiley-leaf transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <ul className="space-y-2 px-3 pb-4 sm:px-4">
                {vragen
                  .filter((v) => v.groep === groep)
                  .map((v) => {
                    const aan = keuze.ids.includes(v.id);
                    return (
                      <li key={v.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${aan ? "bg-smiley-mint ring-smiley-green" : "bg-smiley-cream ring-smiley-ink/10 hover:bg-smiley-mint/60"} ${!aan && vol ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <input type="checkbox" checked={aan} disabled={!aan && vol} onChange={() => wissel(v.id)} className="mt-1 h-5 w-5 shrink-0 accent-[#0E2A20]" />
                          <span className="min-w-0">
                            <span className="block break-words font-semibold leading-snug [hyphens:auto]">{v.tekst}</span>
                            <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                              <span className="rounded-full bg-white px-2.5 py-0.5 text-smiley-leaf ring-1 ring-smiley-leaf/20">{t.soorten[v.soort]}</span>
                              <span className="rounded-full bg-smiley-sun px-2.5 py-0.5 uppercase tracking-wider text-smiley-ink">{t.voorbeeld}</span>
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </details>
          ))}
        </div>

        <div className="mt-6 rounded-[1.5rem] bg-white p-5 ring-1 ring-smiley-ink/10">
          <label htmlFor="sm-samen-eigen" className="block font-display text-lg font-bold">
            {t.eigenLabel}
          </label>
          <input
            id="sm-samen-eigen"
            type="text"
            maxLength={EIGEN_MAX}
            value={keuze.eigen}
            autoComplete="off"
            aria-describedby="sm-samen-eigen-uitleg"
            onChange={(e) => {
              const waarde = e.target.value.slice(0, EIGEN_MAX);
              setLaatst("eigen");
              setKeuze((k) => ({ ...k, eigen: waarde }));
            }}
            className={VELD}
          />
          <p id="sm-samen-eigen-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            {vul(t.eigenUitleg, { max: EIGEN_MAX, n: keuze.eigen.length })}
          </p>
        </div>
      </div>

      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-[2rem] bg-smiley-ink p-6 text-white sm:p-8">
          <h2 className="text-center font-display text-xl font-bold">{t.telefoonKop}</h2>
          <div className="mt-6">
            {/* key: bij een andere keuze begint de telefoon opnieuw, bij de vraag die er net bij kwam */}
            <Telefoon key={`${keuze.ids.join("|")}${eigen ? "+eigen" : ""}`} stappen={stappen} start={start} t={t} />
          </div>
          <p className="mt-5 text-center text-xs font-semibold leading-relaxed text-white/70">{t.telefoonUitleg}</p>
        </div>
        <div className="mt-5">
          {isLeeg({ ids: keuze.ids, eigen }) ? (
            <p className="rounded-2xl bg-white p-4 text-center text-sm font-semibold text-smiley-mute ring-1 ring-smiley-ink/10">{t.eerstKiezen}</p>
          ) : (
            <>
              <Link href={`${demoPad}?${zoek}`} className="block rounded-full bg-smiley-sun px-6 py-4 text-center font-bold text-smiley-ink shadow-[0_18px_40px_-14px_rgba(253,209,26,0.7)] transition-transform hover:-translate-y-0.5">
                {t.demoKnop}
              </Link>
              <p className="mt-3 text-center text-sm leading-relaxed text-smiley-mute">{t.demoUitleg}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
