"use client";

import { useState } from "react";
import { FASES, onderdeelVan } from "@/lib/rijschool/leskaart";
import { ronde, THEORIE_ONDERDELEN, type TheorieOnderdeel, type TheorieScore, type TheorieVraag } from "@/lib/rijschool/theorie";

// Oefenen in de leerling-app: lesvoorbereiding per onderdeel (huiswerk van de
// instructeur bovenaan) en theorievragen met uitleg bij elk antwoord.

const RONDE = 10;

export function Lesvoorbereiding({ huiswerk, open, onOpen, kleur }: { huiswerk: string[]; open: string | null; onOpen: (s: string | null) => void; kleur: string }) {
  const blok = (sleutel: string) => {
    const g = onderdeelVan(sleutel);
    if (!g) return null;
    const isOpen = open === sleutel;
    return (
      <li key={sleutel} className="rounded-xl border border-hair bg-white">
        <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => onOpen(isOpen ? null : sleutel)}>
          <span>
            <span className="block font-semibold">{g.onderdeel.titel}</span>
            <span className="block text-xs text-neutralx-500">{g.fase.titel}</span>
          </span>
          <span className="text-xl" aria-hidden>
            {isOpen ? "−" : "+"}
          </span>
        </button>
        {isOpen && (
          <div className="border-t border-hair px-4 pb-4 pt-3">
            <p className="text-sm text-neutralx-700">{g.onderdeel.uitleg}</p>
            <ol className="mt-3 space-y-2">
              {g.onderdeel.stappen.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm">
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: kleur }}>
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {huiswerk.length > 0 && (
        <section>
          <h3 className="font-semibold">Huiswerk van je instructeur</h3>
          <ul className="mt-2 space-y-2">{huiswerk.map(blok)}</ul>
        </section>
      )}
      {FASES.map((f) => (
        <section key={f.sleutel}>
          <h3 className="font-semibold">{f.titel}</h3>
          <p className="text-sm text-neutralx-600">{f.omschrijving}</p>
          <ul className="mt-2 space-y-2">{f.onderdelen.filter((o) => !huiswerk.includes(o.sleutel)).map((o) => blok(o.sleutel))}</ul>
        </section>
      ))}
    </div>
  );
}

export function TheorieOefenen({ scores, kleur, onKlaar }: { scores: Record<string, TheorieScore>; kleur: string; onKlaar: (onderdeel: string, goed: number, totaal: number) => void }) {
  const [onderdeel, setOnderdeel] = useState<TheorieOnderdeel | "mix" | null>(null);
  const [vragen, setVragen] = useState<TheorieVraag[]>([]);
  const [nr, setNr] = useState(0);
  const [antwoord, setAntwoord] = useState<number | null>(null);
  const [goed, setGoed] = useState(0);

  function begin(o: TheorieOnderdeel | "mix") {
    setOnderdeel(o);
    setVragen(ronde(o, RONDE));
    setNr(0);
    setAntwoord(null);
    setGoed(0);
  }

  if (!onderdeel) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutralx-600">Korte rondes met uitleg bij elk antwoord. Een eigen oefenset van je rijschool; voor het echte theorie-examen oefen je ook met een officiële cursus.</p>
        {[...THEORIE_ONDERDELEN, { sleutel: "mix" as const, titel: "Alles door elkaar" }].map((o) => {
          const s = scores[o.sleutel];
          return (
            <button key={o.sleutel} type="button" onClick={() => begin(o.sleutel)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-hair bg-white p-4 text-left hover:border-neutralx-300">
              <span className="font-semibold">{o.titel}</span>
              <span className="text-sm text-neutralx-600">{s ? `Beste: ${s.goed}/${s.totaal}` : "Nog niet geoefend"}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const vraag = vragen[nr];
  if (!vraag) {
    const totaal = vragen.length;
    return (
      <div className="rounded-2xl border border-hair bg-white p-6 text-center">
        <p className="text-sm text-neutralx-600">Je score</p>
        <p className="num font-display text-5xl font-bold">
          {goed}/{totaal}
        </p>
        <p className="mt-2 text-sm text-neutralx-600">{goed === totaal ? "Foutloos, top!" : goed / totaal >= 0.8 ? "Goed bezig. Lees de uitleg bij je fouten nog eens." : "Blijf oefenen; de uitleg helpt je verder."}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-full px-5 py-2.5 font-semibold text-white" style={{ background: kleur }} onClick={() => begin(onderdeel)}>
            Nog een ronde
          </button>
          <button type="button" className="rounded-full border border-hair px-5 py-2.5 font-semibold" onClick={() => setOnderdeel(null)}>
            Ander onderdeel
          </button>
        </div>
      </div>
    );
  }

  function kies(i: number) {
    if (antwoord !== null || !vraag) return;
    setAntwoord(i);
    if (i === vraag.goed) setGoed((g) => g + 1);
  }

  function volgende() {
    const laatste = nr + 1 >= vragen.length;
    if (laatste && onderdeel) onKlaar(onderdeel, goed, vragen.length);
    setNr(nr + 1);
    setAntwoord(null);
  }

  return (
    <div className="rounded-2xl border border-hair bg-white p-5">
      <div className="flex items-center justify-between text-sm text-neutralx-600">
        <span>
          Vraag {nr + 1} van {vragen.length}
        </span>
        <button type="button" className="underline underline-offset-2" onClick={() => setOnderdeel(null)}>
          Stoppen
        </button>
      </div>
      <p className="mt-3 text-lg font-semibold">{vraag.vraag}</p>
      <div className="mt-4 space-y-2">
        {vraag.opties.map((o, i) => {
          const isGoed = antwoord !== null && i === vraag.goed;
          const isFout = antwoord === i && i !== vraag.goed;
          return (
            <button
              key={o}
              type="button"
              onClick={() => kies(i)}
              disabled={antwoord !== null}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                isGoed ? "border-ok bg-emerald-50" : isFout ? "border-crit bg-red-50" : "border-hair bg-white hover:border-neutralx-300"
              }`}
            >
              {o}
              {isGoed && <span className="sr-only"> (goed)</span>}
              {isFout && <span className="sr-only"> (fout)</span>}
            </button>
          );
        })}
      </div>
      {antwoord !== null && (
        <div className="mt-4" role="status">
          <p className={`font-semibold ${antwoord === vraag.goed ? "text-ok" : "text-crit"}`}>{antwoord === vraag.goed ? "Goed!" : "Niet goed."}</p>
          <p className="mt-1 text-sm text-neutralx-700">{vraag.uitleg}</p>
          <button type="button" className="mt-4 rounded-full px-5 py-2.5 font-semibold text-white" style={{ background: kleur }} onClick={volgende}>
            {nr + 1 >= vragen.length ? "Bekijk je score" : "Volgende vraag"}
          </button>
        </div>
      )}
    </div>
  );
}
