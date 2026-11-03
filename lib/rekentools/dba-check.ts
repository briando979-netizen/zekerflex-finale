// ---------------------------------------------------------------------------
// Rekentool "Wet DBA-check" — ten questions on the points courts and the
// Belastingdienst weigh since the Deliveroo ruling (HR 2023): gezag, inbedding,
// duur en omvang, vrije vervanging, ondernemerschap and tarief. It gives an
// indication from the answers, never a verdict: what counts is the whole
// picture of how the work is done in practice. Content follows lib/kennis/dba.ts.
// Pure, no db: runs in the browser.
// ---------------------------------------------------------------------------

export type DbaAnswer = "ja" | "deels" | "nee";
export type DbaGroup = "gezag" | "inbedding" | "duur" | "vervanging" | "ondernemer";

export interface DbaQuestion {
  id: string;
  group: DbaGroup;
  q: string;
  /** which answer points towards loondienst */
  riskWhen: "ja" | "nee";
  weight: 1 | 2;
  /** shown when the answer points towards loondienst */
  tip: string;
  /** shown when the answer points towards zelfstandigheid */
  good: string;
}

export const DBA_GROUP_LABELS: Record<DbaGroup, string> = {
  gezag: "Gezag",
  inbedding: "Inbedding in je organisatie",
  duur: "Duur en omvang",
  vervanging: "Vrije vervanging",
  ondernemer: "Ondernemerschap",
};

export const DBA_QUESTIONS: DbaQuestion[] = [
  {
    id: "hoe",
    group: "gezag",
    q: "Bepaal jij als opdrachtgever hoe het werk gedaan wordt, en niet alleen wat het resultaat moet zijn?",
    riskWhen: "ja",
    weight: 2,
    tip: "Geef instructies over het resultaat ('de bar is om 17:00 uur open'), niet over elke stap in het werk.",
    good: "Je stuurt op het resultaat, niet op de manier van werken.",
  },
  {
    id: "rooster",
    group: "gezag",
    q: "Wordt de zzp'er ingeroosterd en aangestuurd zoals je eigen personeel, met roosters, verlof aanvragen of functioneringsgesprekken?",
    riskWhen: "ja",
    weight: 2,
    tip: "Laat de zzp'er zelf kiezen voor een klus met een vaste begin- en eindtijd, in plaats van diegene in te roosteren.",
    good: "De zzp'er kiest zelf welke klussen die aanneemt.",
  },
  {
    id: "zijaanzij",
    group: "inbedding",
    q: "Doet de zzp'er precies hetzelfde werk als je vaste medewerkers, zij aan zij en als vaste bezetting?",
    riskWhen: "ja",
    weight: 1,
    tip: "Zet zzp'ers in voor pieken, ziekte of specifieke kennis, niet als vaste bezetting naast je personeel.",
    good: "De zzp'er vangt pieken of uitval op, of brengt eigen expertise mee.",
  },
  {
    id: "personeelsregelingen",
    group: "inbedding",
    q: "Krijgt de zzp'er dezelfde voorzieningen als personeel, zoals bedrijfskleding, personeelskorting, teamuitjes of bonussen?",
    riskWhen: "ja",
    weight: 1,
    tip: "Behandel de zzp'er als externe vakkracht. Personeelsregelingen horen bij werknemers.",
    good: "De zzp'er valt niet onder je personeelsregelingen.",
  },
  {
    id: "lang",
    group: "duur",
    q: "Werkt de zzp'er al langer dan een jaar voor je, of wordt de opdracht steeds verlengd?",
    riskWhen: "ja",
    weight: 2,
    tip: "Houd opdrachten afgebakend en tijdelijk. Bespreek bij een verlenging of het werk inmiddels structureel is.",
    good: "De opdracht is afgebakend in tijd.",
  },
  {
    id: "fulltime",
    group: "duur",
    q: "Werkt de zzp'er (bijna) fulltime en vooral voor jou?",
    riskWhen: "ja",
    weight: 2,
    tip: "Veel uren bij één opdrachtgever lijkt op loondienst. ZekerFlex geeft een seintje als een zzp'er richting de 600 uur bij één opdrachtgever gaat.",
    good: "De zzp'er werkt niet het grootste deel van de week voor jou.",
  },
  {
    id: "vervangen",
    group: "vervanging",
    q: "Mag de zzp'er zich laten vervangen door een andere vakbekwame zelfstandige, zonder dat jij daar toestemming voor hoeft te geven?",
    riskWhen: "nee",
    weight: 2,
    tip: "Leg vast dat vervanging mag. Op ZekerFlex regelt een zzp'er die niet kan zelf een vervanger via het platform.",
    good: "Vrije vervanging is mogelijk: een sterk teken van zelfstandigheid.",
  },
  {
    id: "anderen",
    group: "ondernemer",
    q: "Heeft de zzp'er naast jou ook andere opdrachtgevers?",
    riskWhen: "nee",
    weight: 2,
    tip: "Een zzp'er met één opdrachtgever is kwetsbaar. Meerdere opdrachtgevers laten zien dat iemand echt onderneemt.",
    good: "De zzp'er werkt voor meerdere opdrachtgevers.",
  },
  {
    id: "risico",
    group: "ondernemer",
    q: "Draagt de zzp'er zelf ondernemersrisico, met eigen gereedschap en verzekeringen, geen doorbetaling bij ziekte en aansprakelijkheid voor eigen fouten?",
    riskWhen: "nee",
    weight: 1,
    tip: "Laat de zzp'er eigen middelen en verzekeringen gebruiken. Wie ziek is, factureert niet.",
    good: "De zzp'er draagt zelf ondernemersrisico.",
  },
  {
    id: "tarief",
    group: "ondernemer",
    q: "Ligt het uurtarief duidelijk boven wat een werknemer voor hetzelfde werk kost?",
    riskWhen: "nee",
    weight: 1,
    tip: "Een marktconform tarief laat zien dat iemand echt zelfstandig is. Bij een laag tarief kan een zzp'er makkelijker loondienst claimen bij de rechter.",
    good: "Het tarief past bij een zelfstandige.",
  },
];

export const DBA_MAX_SCORE = DBA_QUESTIONS.reduce((s, q) => s + q.weight, 0);

export type DbaLevel = "laag" | "letop" | "hoog";

/** Shared by the page and the mail with the result. */
export const DBA_LEVEL_TEXT: Record<DbaLevel, { title: string; body: string }> = {
  laag: {
    title: "Weinig signalen van loondienst",
    body: "Zoals je het beschrijft, lijkt dit op samenwerken met een zelfstandige. Blijf het zo inrichten en leg de afspraken vast.",
  },
  letop: {
    title: "Let op: een paar signalen van loondienst",
    body: "Een deel van de samenwerking lijkt op een dienstverband. Pak de punten hieronder aan, dan sta je sterker.",
  },
  hoog: {
    title: "Veel signalen van loondienst",
    body: "Zoals je het beschrijft, lijkt dit eerder op een dienstverband dan op zelfstandig werk. Overweeg om anders samen te werken, bijvoorbeeld via een uitzendkracht.",
  },
};

export interface DbaResult {
  answered: number;
  complete: boolean;
  score: number;
  level: DbaLevel | null;
  /** questions answered towards loondienst, heaviest first */
  attention: { question: DbaQuestion; partly: boolean }[];
  /** questions answered towards zelfstandigheid */
  strengths: DbaQuestion[];
}

/** Risk points for one answer: full weight, half for "deels", none otherwise. */
export function pointsFor(q: DbaQuestion, a: DbaAnswer | undefined): number {
  if (!a) return 0;
  if (a === "deels") return q.weight / 2;
  return a === q.riskWhen ? q.weight : 0;
}

export function levelFor(score: number): DbaLevel {
  if (score >= 9) return "hoog";
  if (score >= 4) return "letop";
  return "laag";
}

export function scoreDba(answers: Partial<Record<string, DbaAnswer>>): DbaResult {
  let score = 0;
  let answered = 0;
  const attention: DbaResult["attention"] = [];
  const strengths: DbaQuestion[] = [];
  for (const q of DBA_QUESTIONS) {
    const a = answers[q.id];
    if (!a) continue;
    answered++;
    const pts = pointsFor(q, a);
    score += pts;
    if (pts > 0) attention.push({ question: q, partly: a === "deels" });
    else strengths.push(q);
  }
  attention.sort((x, y) => pointsFor(y.question, y.partly ? "deels" : y.question.riskWhen) - pointsFor(x.question, x.partly ? "deels" : x.question.riskWhen));
  const complete = answered === DBA_QUESTIONS.length;
  return { answered, complete, score, level: complete ? levelFor(score) : null, attention, strengths };
}
