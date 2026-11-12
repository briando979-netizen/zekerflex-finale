// ---------------------------------------------------------------------------
// Btw-concept: de rekenkern (puur, zonder prisma). Rekent uit de boekregels met een btw-code de rubrieken van de
// Nederlandse aangifte omzetbelasting uit. Het is een CONCEPT: ZekerFlex dient nooit zelf in. Wat niet zeker is
// (afronding, rubrieknummers, kleine-ondernemersregeling, ICP) staat als `doorAccountantTeBevestigen` met een reden.
// De sommen per rubriek komen van btwOverzichtUit (lezen-kern.ts); dit bestand bouwt de aangifte erop.
// ---------------------------------------------------------------------------

import { deadlineLijst } from "../deadlines";
import { btwOverzichtUit, type BtwRegel } from "../lezen-kern";
import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";
import {
  GRONDSLAG_RUBRIEKEN,
  RUBRIEK_TEKST,
  RUBRIEK_VOLGORDE,
  VERSCHULDIGD_RUBRIEKEN,
  VOORBELASTING_RUBRIEK,
  type BtwRubriekRij,
  type Voorbehoud,
} from "./labels";

export interface BtwBerekening {
  rubrieken: BtwRubriekRij[];
  /** rubriek 5a in centen */
  verschuldigdCents: number;
  /** rubriek 5b in centen */
  voorbelastingCents: number;
  /** rubriek 5c in centen; positief = te betalen, negatief = terug te vragen */
  saldoCents: number;
  /** rubrieken die in de boekregels voorkomen maar die we niet kennen (op de verkeerde plek of onbekend nummer) */
  onbekendeRubrieken: string[];
  voorbehouden: Voorbehoud[];
}

const REDEN_AFRONDING =
  "Hele euro's naar beneden afronden is hier aangenomen (bij een negatief bedrag richting nul); of dit ook voor de btw zelf geldt en hoe een negatieve grondslag moet, laat je door een accountant bevestigen.";

const REDEN_PER_RUBRIEK: Readonly<Record<string, string>> = {
  "1a": REDEN_AFRONDING,
  "1b": REDEN_AFRONDING,
  "1c": "Er is nog geen btw-code voor andere tarieven: alleen gevuld als een accountant een code aan deze rubriek koppelt.",
  "1d": "Er is nog geen btw-code voor privégebruik: alleen gevuld als een accountant een code aan deze rubriek koppelt.",
  "1e": "Of een bedrag 0%, vrijgesteld of buiten Nederland belast is, en of het hier of onder 3a/3b hoort, bevestigt een accountant.",
  "2a": "Verlegging binnen Nederland: de rubriek en de bijbehorende voorbelasting in 5b moeten door een accountant worden bevestigd.",
  "3a": "Er is nog geen btw-code voor export buiten de EU: alleen gevuld als een accountant een code koppelt.",
  "3b": "Bij leveringen of diensten aan EU-bedrijven hoort ook de opgaaf ICP (intracommunautaire prestaties). Of dat voor jullie geldt en met welke btw-nummers, bevestigt een accountant.",
  "3c": "Er is nog geen btw-code voor installatie of afstandsverkopen: alleen gevuld als een accountant een code koppelt.",
  "4a": "Verlegging bij inkoop buiten de EU: de rubriek en de voorbelasting in 5b bevestigt een accountant.",
  "4b": "Verlegging bij inkoop uit de EU: de rubriek en de voorbelasting in 5b bevestigt een accountant.",
  "5a": "De optelling van de rubrieken (welke meetellen) bevestigt een accountant.",
  "5b": "Of alle voorbelasting aftrekbaar is (bijvoorbeeld bij een Amerikaanse Inc.) bevestigt een accountant.",
  "5c": "Het saldo klopt alleen als alle rubrieken kloppen; een accountant bevestigt ook of er nog een vermindering of correctie bij moet.",
};

const ALGEMENE_VOORBEHOUDEN: readonly Voorbehoud[] = [
  {
    onderwerp: "Kleine-ondernemersregeling (KOR)",
    reden: "Een eventuele vermindering of vrijstelling volgens de KOR is niet meegerekend: een accountant bevestigt of die geldt.",
  },
  {
    onderwerp: "Afronding",
    reden: REDEN_AFRONDING,
  },
  {
    onderwerp: "Rubrieknummers",
    reden: "De indeling in rubrieken volgt de huidige btw-codes. Een accountant bevestigt de nummers voordat je indient.",
  },
];

/** Hele euro's uit centen: richting nul (een positief bedrag gaat dus naar beneden). Zie REDEN_AFRONDING. */
export function grondslagInEuro(cents: number): number {
  const e = Math.trunc(cents / 100);
  return e === 0 ? 0 : e; // geen -0
}

/**
 * De rubrieken van een kwartaal uit de boekregels. Een tegenboeking haalt eerdere bedragen weg (zie btwOverzichtUit).
 * Alle rubrieken uit RUBRIEK_VOLGORDE staan er altijd in, ook met 0.
 */
export function berekenBtw(regels: readonly BtwRegel[]): BtwBerekening {
  const som = btwOverzichtUit(regels);
  const perRubriek = new Map(som.rubrieken.map((r) => [r.rubriek, r] as const));
  const onbekend = new Set<string>();
  for (const r of som.rubrieken) {
    const bekend = RUBRIEK_VOLGORDE.includes(r.rubriek as (typeof RUBRIEK_VOLGORDE)[number]);
    if (!bekend && (r.grondslagCents !== 0 || r.btwCents !== 0)) {
      onbekend.add(r.rubriek);
      continue;
    }
    if (r.grondslagCents !== 0 && !GRONDSLAG_RUBRIEKEN.includes(r.rubriek)) onbekend.add(r.rubriek);
    if (r.btwCents !== 0 && !VERSCHULDIGD_RUBRIEKEN.includes(r.rubriek) && r.rubriek !== VOORBELASTING_RUBRIEK) onbekend.add(r.rubriek);
  }

  const waarde = (rubriek: string) => {
    const r = perRubriek.get(rubriek);
    return { grondslag: GRONDSLAG_RUBRIEKEN.includes(rubriek) ? (r?.grondslagCents ?? 0) : 0, btw: r?.btwCents ?? 0 };
  };

  const verschuldigdCents = VERSCHULDIGD_RUBRIEKEN.reduce((s, r) => s + waarde(r).btw, 0);
  const voorbelastingCents = waarde(VOORBELASTING_RUBRIEK).btw;
  const saldoCents = verschuldigdCents - voorbelastingCents;

  const rijen: BtwRubriekRij[] = RUBRIEK_VOLGORDE.map((rubriek) => {
    const tekst = RUBRIEK_TEKST[rubriek] ?? { label: rubriek, uitleg: "" };
    const reden = REDEN_PER_RUBRIEK[rubriek];
    const basis = { rubriek, label: tekst.label, uitleg: tekst.uitleg, doorAccountantTeBevestigen: true as const, ...(reden ? { reden } : {}) };
    if (rubriek === "5a") return { ...basis, grondslagCents: null, grondslagEuro: null, btwCents: verschuldigdCents };
    if (rubriek === "5b") return { ...basis, grondslagCents: null, grondslagEuro: null, btwCents: voorbelastingCents };
    if (rubriek === "5c") return { ...basis, grondslagCents: null, grondslagEuro: null, btwCents: saldoCents };
    const w = waarde(rubriek);
    return { ...basis, grondslagCents: w.grondslag, grondslagEuro: grondslagInEuro(w.grondslag), btwCents: w.btw };
  });

  const voorbehouden: Voorbehoud[] = [...ALGEMENE_VOORBEHOUDEN];
  const bij3b = rijen.find((r) => r.rubriek === "3b");
  if (bij3b && (bij3b.grondslagCents ?? 0) !== 0) {
    voorbehouden.push({ onderwerp: "Opgaaf ICP", reden: "Er staan verkopen aan EU-bedrijven in rubriek 3b: de opgaaf ICP is een aparte aangifte, die dit concept niet maakt." });
  }

  return { rubrieken: rijen, verschuldigdCents, voorbelastingCents, saldoCents, onbekendeRubrieken: [...onbekend].sort(), voorbehouden };
}

/** De laatste dag voor indienen van een kwartaal, "2026-04-30" (uit deadlineLijst; die lijst zelf blijft zoals ze is). */
export function btwDeadlineDag(jaar: number, kwartaal: number): string | null {
  const eersteMaand = (kwartaal - 1) * 3 + 1;
  const begin = amsterdamToUtc(jaar, eersteMaand, 1, 0, 0, 0);
  const d = deadlineLijst(begin, 15).find((x) => x.sleutel === `btw-${jaar}-k${kwartaal}`);
  return d ? amsterdamDayKey(d.datum) : null;
}

const csvVeld = (t: string): string => (/[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
const komma = (cents: number): string => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
};

/**
 * Het concept als CSV (puntkomma, komma als decimaalteken, zodat Excel in Nederland het goed opent):
 * rubriek, omschrijving, grondslag in hele euro's, btw. Zonder persoonsgegevens.
 */
export function conceptNaarCsv(rubrieken: readonly BtwRubriekRij[]): string {
  const regels = ["Rubriek;Omschrijving;Grondslag (hele euro's);Btw (euro)"];
  for (const r of rubrieken) {
    regels.push([r.rubriek, csvVeld(r.label), r.grondslagEuro === null ? "" : String(r.grondslagEuro), komma(r.btwCents)].join(";"));
  }
  regels.push("", "Dit is een concept en geen aangifte. Een accountant bevestigt de rubrieken en de afronding voor je indient.");
  return `﻿${regels.join("\r\n")}\r\n`;
}
