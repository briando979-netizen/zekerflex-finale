"use client";

import { useEffect, useRef, useState } from "react";

/**
 * De telefoon bij "De app" met een voorbeeld van de werker-app (eigen foto's uit public/welkom, zie CREDITS.md). Alleen sfeer,
 * geen echte klus. Zodra de telefoon in beeld komt, stapt de persoon een stukje uit het scherm en vallen er na 1 seconde
 * meldingen binnen. Vegen (of een tik op een tab) brengt je naar Agenda, Berichten en Uren. Beweging staat uit bij
 * "minder beweging" (globals.css, .telefoon-*).
 */
const TABS = ["Klussen", "Agenda", "Berichten", "Uren"] as const;

const MELDINGEN = [
  { van: "ZekerFlex", tekst: "Nieuwe klus bij jou in de buurt: Magazijn · Utrecht" },
  { van: "Magazijn · Utrecht", tekst: "Je bent gekozen. Tot morgen om 07:00!" },
  { van: "ZekerFlex", tekst: "Je uren zijn goedgekeurd" },
] as const;

const DAGEN = [
  { dag: "ma", vol: false },
  { dag: "di", vol: true },
  { dag: "wo", vol: false },
  { dag: "do", vol: false },
  { dag: "vr", vol: true },
  { dag: "za", vol: false },
  { dag: "zo", vol: false },
] as const;

const AFSPRAKEN = [
  { dag: "Dinsdag", tijd: "07:00 - 15:30", wat: "Magazijn · Utrecht", status: "Bevestigd", klaar: true },
  { dag: "Vrijdag", tijd: "17:00 - 23:00", wat: "Horeca · Amsterdam-West", status: "Bevestigd", klaar: true },
  { dag: "Zaterdag", tijd: "Hele dag", wat: "Je staat op beschikbaar", status: "Open", klaar: false },
] as const;

const GESPREKKEN = [
  { naam: "Magazijn · Utrecht", tekst: "Top, tot morgen om 07:00!", tijd: "09:12", nieuw: 1, letter: "M" },
  { naam: "Horeca · Amsterdam-West", tekst: "Kun je vrijdag ook een uur eerder?", tijd: "gisteren", nieuw: 2, letter: "H" },
  { naam: "ZekerFlex", tekst: "Je ID is goedgekeurd. Je kunt aan de slag.", tijd: "ma", nieuw: 0, letter: "Z" },
] as const;

const UREN = [
  { wat: "Di · Magazijn", uren: "8 uur", status: "Goedgekeurd", klaar: true },
  { wat: "Vr · Horeca", uren: "6 uur", status: "Ingediend", klaar: false },
] as const;

const KAART = "flex items-center gap-2.5 rounded-xl bg-white/[0.07] p-2";

export function TelefoonDemo() {
  const kader = useRef<HTMLDivElement>(null);
  const veeg = useRef<HTMLDivElement>(null);
  const [inBeeld, setInBeeld] = useState(false);
  const [tab, setTab] = useState(0);
  const [melding, setMelding] = useState<number | null>(null);

  // pas bewegen als de telefoon echt in beeld is (één keer)
  useEffect(() => {
    const el = kader.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInBeeld(true);
      return;
    }
    const io = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) {
          setInBeeld(true);
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // na 1 seconde de eerste melding, daarna de volgende
  useEffect(() => {
    if (!inBeeld) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    MELDINGEN.forEach((_, i) => {
      const start = 1000 + i * 4400;
      timers.push(setTimeout(() => setMelding(i), start));
      timers.push(setTimeout(() => setMelding((nu) => (nu === i ? null : nu)), start + 3600));
    });
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [inBeeld]);

  function naar(i: number) {
    const el = veeg.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function bijVegen() {
    const el = veeg.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setTab(Math.min(TABS.length - 1, Math.max(0, i)));
  }

  const uit = inBeeld && tab === 0;
  const m = melding === null ? undefined : MELDINGEN[melding];

  return (
    <div className="mx-auto w-[min(270px,70%)] pt-20">
      <div ref={kader} role="group" aria-label="Voorbeeld van de app" className={`telefoon relative${uit ? " is-uit" : ""}`}>
        {/* gloed achter de telefoon */}
        <span className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-brand-mint/15 blur-3xl" />
        {/* zijknoppen */}
        <span className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l bg-white/25" />
        <span className="absolute -left-[3px] top-36 h-14 w-[3px] rounded-l bg-white/25" />
        <span className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-r bg-white/25" />
        <div className="relative rounded-[2.6rem] border border-white/20 bg-gradient-to-b from-white/[0.14] to-white/[0.04] p-[7px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
          <div className="relative aspect-[9/19] overflow-hidden rounded-[2.1rem] bg-[#0C0E12]">
            {/* statusbalk + eiland */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-2.5 text-[9px] font-semibold text-white" aria-hidden>
              <span>9:41</span>
              <span className="h-4 w-16 rounded-full bg-black" />
              <span className="tracking-tight">●●●</span>
            </div>

            {/* melding die binnenvalt */}
            {m ? (
              <div key={melding} className="telefoon-melding absolute inset-x-2 top-8 z-30 flex items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-lg" aria-hidden>
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-ink font-display text-[9px] font-bold text-brand-mint">ZF</span>
                <span className="min-w-0">
                  <span className="block truncate text-[9px] font-bold text-ink">{m.van}</span>
                  <span className="block text-[9px] leading-snug text-ink/75">{m.tekst}</span>
                </span>
              </div>
            ) : null}

            {/* de vier schermen naast elkaar: vegen of een tab kiezen */}
            <div ref={veeg} onScroll={bijVegen} className="telefoon-veeg flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
              {/* 1. Klussen */}
              <div className="h-full w-full flex-shrink-0 snap-start">
                <div className="relative h-[54%] w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/welkom/slide-1.webp" alt="" loading="lazy" className="h-full w-full object-cover object-[50%_25%]" />
                  <span className="absolute inset-0 bg-gradient-to-t from-[#0C0E12] via-[#0C0E12]/30 to-black/25" />
                  <div className="absolute inset-x-3 bottom-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2 py-0.5 text-[9px] font-bold text-ink">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                      Gematcht in 6 min
                    </span>
                    <p className="mt-1.5 font-display text-[15px] font-bold leading-tight text-white">Horeca-medewerker</p>
                    <p className="text-[10px] text-white/70">Vakkenvuller · Amsterdam-West</p>
                  </div>
                </div>
                <div className="space-y-2 px-3 pt-3">
                  <div className={KAART}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/welkom/slide-2.webp" alt="" loading="lazy" className="h-9 w-9 rounded-lg object-cover object-[50%_20%]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] font-semibold text-white">Magazijn · Utrecht</p>
                      <p className="text-[9px] text-white/60">Morgen · 07:00 - 15:30</p>
                    </div>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand-mint">Reageer</span>
                  </div>
                  <div className={KAART}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-mint/20 text-sm">📍</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] font-semibold text-white">Inchecken op locatie</p>
                      <p className="text-[9px] text-white/60">Automatisch via je telefoon</p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-brand-mint" />
                  </div>
                  <div className={KAART}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-mint/20 text-sm">🕒</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] font-semibold text-white">Uren indienen</p>
                      <p className="text-[9px] text-white/60">Na je dienst, in een paar tikken</p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                  </div>
                </div>
              </div>

              {/* 2. Agenda */}
              <div className="h-full w-full flex-shrink-0 snap-start px-3 pt-10">
                <p className="font-display text-[15px] font-bold text-white">Agenda</p>
                <p className="text-[9px] text-white/60">Deze week · 2 diensten</p>
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {DAGEN.map((d) => (
                    <span
                      key={d.dag}
                      className={`grid place-items-center rounded-lg py-1.5 text-[8px] font-semibold ${d.vol ? "bg-brand-mint text-ink" : "bg-white/[0.07] text-white/60"}`}
                    >
                      {d.dag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {AFSPRAKEN.map((a) => (
                    <div key={a.dag} className="rounded-xl bg-white/[0.07] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-white">{a.dag}</p>
                        <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-semibold ${a.klaar ? "bg-brand-mint/20 text-brand-mint" : "bg-white/10 text-white/60"}`}>
                          {a.status}
                        </span>
                      </div>
                      <p className="text-[9px] text-white/60">
                        {a.tijd} · {a.wat}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Berichten */}
              <div className="h-full w-full flex-shrink-0 snap-start px-3 pt-10">
                <p className="font-display text-[15px] font-bold text-white">Berichten</p>
                <p className="text-[9px] text-white/60">Chat met je opdrachtgever en met ons</p>
                <div className="mt-3 space-y-2">
                  {GESPREKKEN.map((g) => (
                    <div key={g.naam} className={KAART}>
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-mint/20 text-[11px] font-bold text-brand-mint">{g.letter}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[10.5px] font-semibold text-white">{g.naam}</p>
                          <span className="flex-shrink-0 text-[8px] text-white/50">{g.tijd}</span>
                        </div>
                        <p className="truncate text-[9px] text-white/60">{g.tekst}</p>
                      </div>
                      {g.nieuw > 0 ? (
                        <span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-brand-mint text-[8px] font-bold text-ink">{g.nieuw}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-full bg-white/[0.07] px-3 py-2 text-[9px] text-white/45">Typ een bericht…</div>
              </div>

              {/* 4. Uren */}
              <div className="h-full w-full flex-shrink-0 snap-start px-3 pt-10">
                <p className="font-display text-[15px] font-bold text-white">Uren</p>
                <p className="text-[9px] text-white/60">Deze week</p>
                <div className="mt-3 rounded-xl bg-brand-mint/15 p-3">
                  <p className="font-display text-2xl font-bold leading-none text-white">14 uur</p>
                  <p className="mt-1 text-[9px] text-white/70">gewerkt in 2 diensten</p>
                </div>
                <div className="mt-3 space-y-2">
                  {UREN.map((u) => (
                    <div key={u.wat} className={KAART}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-semibold text-white">{u.wat}</p>
                        <p className="text-[9px] text-white/60">{u.uren}</p>
                      </div>
                      <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-semibold ${u.klaar ? "bg-brand-mint/20 text-brand-mint" : "bg-white/10 text-white/70"}`}>
                        {u.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-brand-mint py-2 text-center text-[10px] font-bold text-ink">Uren indienen</div>
              </div>
            </div>

            {/* onderbalk */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-white/10 bg-[#0C0E12]/95 px-2 pb-3 pt-2 text-[8px]">
              {TABS.map((naam, i) => (
                <button
                  key={naam}
                  type="button"
                  onClick={() => naar(i)}
                  aria-pressed={tab === i}
                  className={`rounded px-1.5 py-0.5 transition-colors ${tab === i ? "font-semibold text-brand-mint" : "text-white/50 hover:text-white/80"}`}
                >
                  {tab === i ? "● " : ""}
                  {naam}
                </button>
              ))}
            </div>
          </div>

          {/* de uitgeknipte persoon: ligt in rust precies op de foto en stapt naar voren, over de rand van de telefoon */}
          <div className="telefoon-pop-vak pointer-events-none absolute left-[7px] right-[7px] top-[7px] z-[25]" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/welkom/slide-1-uit.webp" alt="" loading="lazy" className="telefoon-pop h-full w-full object-cover object-[50%_25%]" />
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-white/65">Veeg door de app, of tik op een tab</p>
    </div>
  );
}
