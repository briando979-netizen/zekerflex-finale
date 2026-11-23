"use client";

import { useId, useState, type ReactNode } from "react";
import { Euro, Hoek, IcoonVak, Kalender, Klok, Koffer, Label, Mensen, Pauze, Speld, Wekker } from "@/components/werkgever/iconen";

// De kaarten "Klus omschrijving" en "Klusinformatie" op de kluspagina van een bedrijf (23 nov 2026, zoals YoungOnes): de
// informatie als blokjes (grijs vakje met een icoon, een vet label, de waarde), eerst één rij en de rest achter "Toon meer
// klusinformatie". De omschrijving is op een telefoon ingekort tot een paar regels met "Lees meer". De pagina (server) maakt
// de teksten en geeft per blokje alleen een sleutel voor het icoon door: een servercomponent geeft geen component of functie
// door aan een clientcomponent.

export type InfoIcoon = "datum" | "tijd" | "pauze" | "aantal" | "plaats" | "branche" | "annuleren" | "tarief" | "kostenplaats";

export interface InfoBlokje {
  icoon: InfoIcoon;
  label: string;
  /** één of meer regels onder het label */
  regels: string[];
}

const ICONEN: Record<InfoIcoon, ReactNode> = {
  datum: <Kalender />,
  tijd: <Klok />,
  pauze: <Pauze />,
  aantal: <Mensen />,
  plaats: <Speld />,
  branche: <Koffer />,
  annuleren: <Wekker />,
  tarief: <Euro />,
  kostenplaats: <Label />,
};

/** Eén blokje: icoonvakje, vet label, de waarde eronder. Ook de kop van de pagina gebruikt het (Datum, Tijd, Pauze). */
export function InfoBlok({ blokje }: { blokje: InfoBlokje }) {
  return (
    <div className="flex min-w-0 items-start gap-4">
      <IcoonVak>{ICONEN[blokje.icoon]}</IcoonVak>
      <div className="min-w-0">
        <dt className="text-sm font-bold text-ink">{blokje.label}</dt>
        {blokje.regels.map((r) => (
          <dd key={r} className="break-words text-sm leading-relaxed text-ink">
            {r}
          </dd>
        ))}
      </div>
    </div>
  );
}

const LINK = "mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline";

export function KlusInformatie({ eerst, meer, toonMeer, toonMinder }: { eerst: InfoBlokje[]; meer: InfoBlokje[]; toonMeer: string; toonMinder: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
        {eerst.map((b) => (
          <InfoBlok key={b.label} blokje={b} />
        ))}
      </dl>
      {meer.length > 0 && (
        <>
          <dl id={id} hidden={!open} className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
            {meer.map((b) => (
              <InfoBlok key={b.label} blokje={b} />
            ))}
          </dl>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className={LINK}>
            {open ? toonMinder : toonMeer}
            <Hoek open={open} />
          </button>
        </>
      )}
    </>
  );
}

/** De omschrijving van de klus; op een telefoon eerst een paar regels, met "Lees meer". */
export function KlusOmschrijving({ tekst, leesMeer, leesMinder }: { tekst: string; leesMeer: string; leesMinder: string }) {
  const [open, setOpen] = useState(false);
  const lang = tekst.length > 180 || tekst.split("\n").length > 3;
  return (
    <>
      <p className={`whitespace-pre-line break-words text-base leading-relaxed text-ink ${open || !lang ? "" : "line-clamp-3 sm:line-clamp-none"}`}>{tekst}</p>
      {lang && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${LINK} sm:hidden`}>
          {open ? leesMinder : leesMeer}
          <Hoek open={open} />
        </button>
      )}
    </>
  );
}
