"use client";

import { useEffect, useRef, useState } from "react";
import { KlusKaart } from "@/components/marketing/KlusKaart";
import { shiftCategory } from "@/lib/shifts/category";
import { euroCents } from "@/lib/rekentools/invoer";
import { initialen } from "@/lib/klusconcept/website";
import { tekstOp } from "@/lib/rijschool/kleuren";

// ---------------------------------------------------------------------------
// /klus-plaatsen: what happens after placing the klus, as a short simulation on
// a phone, with the visitor's own klus. Everything after the card is an example
// (a made-up kracht "Sanne"), and says so. Plays by itself once it scrolls into
// view, never with reduced motion; every step can also be clicked.
// ---------------------------------------------------------------------------

export interface SimulatieKlus {
  title: string;
  bedrijf: string;
  city: string;
  when: string;
  start: string;
  rateCents: number;
  hours: number;
}

const STAP_MS = 3800;
const BRAND = "#0E5C4A";
const uurNl = (h: number) => h.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

function stappen(k: SimulatieKlus, supply: string | null) {
  return [
    { kop: "Je klus staat online", tekst: "Krachten zien hem meteen in de app, met jouw tarief en tijden." },
    {
      kop: "Krachten in de buurt krijgen een melding",
      tekst: supply
        ? `${supply} krachten met een ZekerFlex-profiel wonen binnen 25 km van ${k.city}. Wie past, krijgt een melding.`
        : "Wie in de buurt woont en bij de klus past, krijgt een melding op de telefoon.",
    },
    { kop: "Een kracht reageert", tekst: "Je ziet het profiel: ervaring, beoordelingen en eerdere klussen." },
    { kop: "Jij kiest wie er komt", tekst: "Je bevestigt met één knop. De kracht krijgt meteen bericht met het adres." },
    { kop: "Pas na het werk betaal je", tekst: "De kracht dient de uren in en jij keurt ze goed. Pas dan komt de factuur." },
  ];
}

function Werkgever({ bedrijf, logo, kleur }: { bedrijf: string; logo: string | null; kleur: string | null }) {
  const bg = kleur ?? BRAND;
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="h-9 w-9 flex-shrink-0 rounded-xl border border-hair bg-white object-contain p-1" />
  ) : (
    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-xs font-bold" style={{ background: bg, color: tekstOp(bg) }} aria-hidden="true">
      {initialen(bedrijf)}
    </span>
  );
}

function Scherm({ stap, k, logo, kleur, kosten }: { stap: number; k: SimulatieKlus; logo: string | null; kleur: string | null; kosten: { loonCents: number; feeCents: number; totaalCents: number } }) {
  const cat = shiftCategory(k.title, null);
  if (stap === 0) {
    return (
      <div className="flex h-full flex-col bg-paper-soft">
        <p className="px-4 pt-9 font-display text-lg font-bold text-ink">Ontdekken</p>
        <div className="flex gap-1.5 px-4 pt-2 text-[11px] font-semibold">
          <span className="rounded-full bg-ink px-2.5 py-1 text-white">Alles</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-neutralx-600">{cat.label}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-neutralx-600">In de buurt</span>
        </div>
        <div className="p-3">
          <KlusKaart title={k.title} bedrijf={k.bedrijf} city={k.city} when={k.when} rateCents={k.rateCents} hours={k.hours} ribbon="Nieuw" />
        </div>
      </div>
    );
  }
  if (stap === 1) {
    return (
      <div className="relative flex h-full flex-col items-center overflow-hidden bg-ink px-3 pt-10 text-white">
        <p className="font-display text-5xl font-bold tabular-nums">9:41</p>
        <p className="mt-1 text-xs text-white/70">Een kracht in {k.city}</p>
        <div className="relative mt-8 w-full">
          <div className="absolute inset-x-3 -bottom-2 h-full rounded-2xl bg-white/10" aria-hidden="true" />
          <div className="relative rounded-2xl bg-white/95 p-3 text-left text-ink shadow-lg motion-safe:animate-slide-up-fade">
            <div className="flex items-center gap-2 text-[11px] text-neutralx-600">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-600 text-[10px] font-bold text-white">Z</span>
              <span className="font-semibold text-ink">ZekerFlex</span>
              <span className="ml-auto">nu</span>
            </div>
            <p className="mt-1.5 text-sm font-bold">Nieuwe klus in {k.city}</p>
            <p className="mt-0.5 text-xs leading-snug text-neutralx-700">
              {k.title} bij {k.bedrijf} · {k.when} · {euroCents(k.rateCents)}/u
            </p>
          </div>
        </div>
        <div className="relative mt-14 grid h-28 w-28 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-full border border-white/20 motion-safe:animate-ping" />
          <span className="absolute inset-4 rounded-full border border-white/30" />
          <span className="h-3 w-3 rounded-full bg-brand-mint" />
        </div>
      </div>
    );
  }
  if (stap === 2) {
    return (
      <div className="flex h-full flex-col bg-paper-soft p-4 pt-9 text-left">
        <div className="flex items-center gap-2">
          <Werkgever bedrijf={k.bedrijf} logo={logo} kleur={kleur} />
          <div className="min-w-0">
            <p className="truncate text-xs text-neutralx-600">{k.bedrijf}</p>
            <p className="font-display text-base font-bold text-ink">Reacties op je klus</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-hair bg-white p-3 shadow-sm motion-safe:animate-slide-up-fade">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 font-bold text-brand-700" aria-hidden="true">
              S
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                Sanne <span className="rounded-full bg-paper-soft px-1.5 py-0.5 text-[10px] font-semibold text-neutralx-600">voorbeeld</span>
              </p>
              <p className="text-xs text-neutralx-600">★ 4,8 · 23 klussen gewerkt · 3 km</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Ervaring in {cat.label.toLowerCase()}</span>
            <span className="rounded-full bg-trust-soft px-2 py-0.5 text-trust-ink">ID gecontroleerd</span>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Wacht op jouw keuze</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold" aria-hidden="true">
            <span className="rounded-full border border-hair py-2 text-center text-ink">Profiel</span>
            <span className="rounded-full bg-brand-600 py-2 text-center text-white">Aannemen</span>
          </div>
        </div>
      </div>
    );
  }
  if (stap === 3) {
    return (
      <div className="flex h-full flex-col items-center bg-paper-soft p-4 pt-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ok text-3xl text-white motion-safe:animate-scale-in" aria-hidden="true">
          ✓
        </span>
        <p className="mt-4 font-display text-lg font-bold text-ink">Sanne komt werken</p>
        <p className="mt-1 text-xs text-neutralx-600">{k.when}</p>
        <p className="mt-1 text-xs text-neutralx-600">Ze kreeg het adres, de route en jouw contactpersoon.</p>
        <div className="mt-6 w-full space-y-2 text-left text-xs">
          <div className="flex items-end gap-2">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700" aria-hidden="true">
              S
            </span>
            <p className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-ink shadow-sm">Top, ik ben er om {k.start}!</p>
          </div>
          <div className="flex items-end justify-end gap-2">
            <p className="rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-white">Welkom! Meld je bij de ingang.</p>
            <Werkgever bedrijf={k.bedrijf} logo={logo} kleur={kleur} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-paper-soft p-4 pt-9 text-left">
      <p className="font-display text-base font-bold text-ink">Uren van Sanne</p>
      <div className="mt-3 rounded-2xl border border-hair bg-white p-3 shadow-sm">
        <p className="text-xs text-neutralx-600">{k.when}</p>
        <p className="num mt-1 font-semibold text-ink">{uurNl(k.hours)} uur gewerkt</p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-bold text-green-800 motion-safe:animate-scale-in">✓ Goedgekeurd door jou</p>
      </div>
      <div className="mt-3 rounded-2xl border border-hair bg-white p-3 text-xs shadow-sm">
        <p className="font-semibold text-ink">Factuur</p>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1">
          <dt className="text-neutralx-600">Loon Sanne</dt>
          <dd className="num text-right text-ink">{euroCents(kosten.loonCents)}</dd>
          <dt className="text-neutralx-600">Platformkosten</dt>
          <dd className="num text-right text-ink">{euroCents(kosten.feeCents)}</dd>
          <dt className="border-t border-hair pt-1 font-semibold text-ink">Totaal excl. btw</dt>
          <dd className="num border-t border-hair pt-1 text-right font-bold text-money-ink">{euroCents(kosten.totaalCents)}</dd>
        </dl>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-neutralx-600">Je betaalt alleen voor gewerkte en goedgekeurde uren.</p>
    </div>
  );
}

export function KlusSimulatie({
  klus,
  supply,
  logo,
  kleur,
  kosten,
}: {
  klus: SimulatieKlus;
  supply: string | null;
  logo: string | null;
  kleur: string | null;
  /** for one kracht */
  kosten: { loonCents: number; feeCents: number; totaalCents: number };
}) {
  const lijst = stappen(klus, supply);
  const laatste = lijst.length - 1;
  const [stap, setStap] = useState(0);
  const [speelt, setSpeelt] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const gezien = useRef(false);

  // Start once by itself when it scrolls into view — not with reduced motion.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!gezien.current && entries.some((e) => e.isIntersecting)) {
          gezien.current = true;
          setSpeelt(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!speelt) return;
    if (stap >= laatste) {
      setSpeelt(false);
      return;
    }
    const t = window.setTimeout(() => setStap((s) => Math.min(s + 1, laatste)), STAP_MS);
    return () => window.clearTimeout(t);
  }, [speelt, stap, laatste]);

  const kies = (n: number) => {
    setSpeelt(false);
    setStap(Math.max(0, Math.min(laatste, n)));
  };
  const speel = () => {
    if (speelt) return setSpeelt(false);
    if (stap >= laatste) setStap(0);
    setSpeelt(true);
  };
  const huidig = lijst[stap] ?? lijst[0]!;

  return (
    <div ref={box} className="rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8">
      <p className="eyebrow">Simulatie</p>
      <h2 className="mt-2 font-display text-2xl font-bold text-ink md:text-3xl">Zo gaat het als je klus online staat</h2>
      <p className="mt-2 max-w-2xl text-sm text-neutralx-600">
        Met jouw klus van hierboven. De kracht in dit voorbeeld (Sanne) is verzonnen; zo ziet het er straks in het echt uit.
      </p>

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <ol className="space-y-2">
            {lijst.map((s, i) => (
              <li key={s.kop}>
                <button
                  type="button"
                  onClick={() => kies(i)}
                  aria-current={i === stap ? "step" : undefined}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left motion-safe:transition-colors ${
                    i === stap ? "border-brand-500 bg-mintwash" : "border-hair bg-white hover:bg-paper-soft"
                  }`}
                >
                  <span
                    className={`num grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                      i < stap ? "bg-ok text-white" : i === stap ? "bg-brand-600 text-white" : "bg-paper-soft text-neutralx-600"
                    }`}
                    aria-hidden="true"
                  >
                    {i < stap ? "✓" : i + 1}
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">{s.kop}</span>
                    {i === stap ? <span className="mt-0.5 block text-sm text-neutralx-700">{s.tekst}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => kies(stap - 1)} disabled={stap === 0} className="btn-ghost disabled:opacity-40">
              Vorige
            </button>
            <button type="button" onClick={speel} className="btn-primary">
              {speelt ? "Pauze" : stap >= laatste ? "Opnieuw afspelen" : "Speel af"}
            </button>
            <button type="button" onClick={() => kies(stap + 1)} disabled={stap >= laatste} className="btn-ghost disabled:opacity-40">
              Volgende
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            Stap {stap + 1} van {lijst.length}: {huidig.kop}. {huidig.tekst}
          </p>
        </div>

        <div className="mx-auto w-full max-w-[290px]" role="group" aria-label={`Voorbeeldscherm: ${huidig.kop}`}>
          <div className="relative h-[560px] overflow-hidden rounded-[2.6rem] border-[10px] border-ink bg-ink shadow-lift">
            <span className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" aria-hidden="true" />
            <div key={stap} className="h-full overflow-hidden rounded-[2rem] motion-safe:animate-fade-up">
              <Scherm stap={stap} k={klus} logo={logo} kleur={kleur} kosten={kosten} />
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
            {lijst.map((s, i) => (
              <span key={s.kop} className={`h-1.5 rounded-full motion-safe:transition-all ${i === stap ? "w-6 bg-brand-600" : "w-1.5 bg-hair"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
