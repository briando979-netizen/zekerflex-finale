// ---------------------------------------------------------------------------
// ZekerFlex Telefonie: een zakelijk nummer voor opdrachtgevers en flexkrachten,
// met losse opties of een bundel. Pure catalogus + prijsberekening, ook in de
// browser te gebruiken (het samenstellen toont de prijs live). De server rekent
// bij een aanvraag altijd zelf opnieuw (lib/telephony/lines.ts).
//
// Wat echt kan (Twilio, gemeten nov 2026): alleen Nederlandse mobiele
// 097-nummers zijn direct te koop (bellen + sms, ±$7,70 per maand inkoop).
// 06-, 085/088-, lokale en 0800-nummers lopen via een partner: "op aanvraag".
// Je eigen nummer houden kan altijd: doorschakelen naar je ZekerFlex-lijn (ook
// een 097-lijn), dan werken alle opties op je eigen nummer.
// ---------------------------------------------------------------------------

export type NumberKind = "eigen" | "mobiel097" | "mobiel06" | "lokaal" | "zakelijk085" | "zakelijk088" | "gratis0800" | "overzetten";
export type Availability = "direct" | "aanvraag";

export interface NumberType {
  id: NumberKind;
  label: string;
  example: string;
  blurb: string;
  availability: Availability;
}

export const NUMBER_TYPES: readonly NumberType[] = [
  { id: "eigen", label: "Je eigen nummer houden", example: "06…, 085…, 020…", availability: "direct", blurb: "Je houdt je huidige nummer. Zet bij je provider doorschakelen aan naar je ZekerFlex-lijn; dan werken alle opties op je eigen nummer." },
  { id: "mobiel097", label: "Nieuw mobiel nummer", example: "097 010 …", availability: "direct", blurb: "Een Nederlands mobiel nummer met bellen en sms. Meestal dezelfde of de volgende werkdag klaar." },
  { id: "mobiel06", label: "Nieuw 06-nummer", example: "06 …", availability: "aanvraag", blurb: "Via een Nederlandse partner. Je hoort binnen 2 werkdagen wat het kost en wanneer het klaar is." },
  { id: "lokaal", label: "Lokaal nummer", example: "020, 010, 050 …", availability: "aanvraag", blurb: "Met het netnummer van je stad. Daarvoor heb je een adres in die regio nodig." },
  { id: "zakelijk085", label: "Landelijk nummer 085", example: "085 …", availability: "aanvraag", blurb: "Eén landelijk nummer, niet aan een stad gebonden." },
  { id: "zakelijk088", label: "Landelijk nummer 088", example: "088 …", availability: "aanvraag", blurb: "Voor bedrijven met meerdere vestigingen." },
  { id: "gratis0800", label: "Gratis nummer 0800", example: "0800 …", availability: "aanvraag", blurb: "Bellen is gratis voor je klant; de belminuten komen op jouw rekening." },
  { id: "overzetten", label: "Bestaand nummer overzetten", example: "nummerbehoud", availability: "aanvraag", blurb: "Je nummer verhuist helemaal naar ZekerFlex. Dat duurt een paar weken; tot die tijd kun je doorschakelen." },
];

/** Nummersoorten waarvoor de klant zijn huidige nummer moet opgeven. */
export const NEEDS_OWN_NUMBER: readonly NumberKind[] = ["eigen", "overzetten"];

export type OptionId = "ai" | "voicemail" | "doorschakelen" | "keuzemenu" | "team" | "opnemen" | "sms";

export interface LineOption {
  id: OptionId;
  label: string;
  blurb: string;
}

export const OPTIONS: readonly LineOption[] = [
  { id: "ai", label: "AI-assistent", blurb: "Neemt dag en nacht op in het Nederlands of Engels, beantwoordt vragen over je bedrijf en plant terugbelafspraken. Je krijgt van elk gesprek een samenvatting." },
  { id: "voicemail", label: "Voicemail in ZekerFlex", blurb: "Ingesproken berichten komen als tekst en geluid in je ZekerFlex-chat." },
  { id: "doorschakelen", label: "Doorschakelen", blurb: "Gesprekken gaan naar je eigen telefoon, binnen je openingstijden. Daarbuiten voicemail of de AI-assistent." },
  { id: "keuzemenu", label: "Keuzemenu", blurb: "\"Toets 1 voor planning, 2 voor administratie.\" Elke keuze komt bij de juiste persoon." },
  { id: "team", label: "Teamnummer", blurb: "Meerdere telefoons gaan tegelijk over. Wie het eerst opneemt, heeft het gesprek." },
  { id: "opnemen", label: "Gesprekken opnemen", blurb: "Met een melding aan de beller. Terug te luisteren en als tekst te lezen." },
  { id: "sms", label: "Sms", blurb: "Sms'jes ontvangen en versturen vanuit ZekerFlex." },
];

export type BundleId = "start" | "zakelijk" | "compleet";

export interface Bundle {
  id: BundleId;
  label: string;
  blurb: string;
  options: readonly OptionId[];
}

/** Een bundel is de lijn plus een vaste set opties, voordeliger dan los. */
export const BUNDLES: readonly Bundle[] = [
  { id: "start", label: "Start", blurb: "Altijd bereikbaar, zonder gedoe.", options: ["voicemail", "doorschakelen"] },
  { id: "zakelijk", label: "Zakelijk", blurb: "Voor een team met vaste tijden.", options: ["voicemail", "doorschakelen", "keuzemenu", "team", "sms"] },
  { id: "compleet", label: "AI Compleet", blurb: "Nooit meer een gemiste klant.", options: ["voicemail", "doorschakelen", "keuzemenu", "team", "sms", "ai", "opnemen"] },
];

export type AnswerAt = "telefoon" | "app" | "ai";
export const ANSWER_AT: readonly { id: AnswerAt; label: string; soon?: boolean }[] = [
  { id: "telefoon", label: "Op mijn eigen telefoon" },
  { id: "ai", label: "De AI-assistent neemt eerst op" },
  // bellen in de browser/app vraagt nog een eigen koppeling (Twilio Voice SDK)
  { id: "app", label: "In de ZekerFlex-app en op de computer", soon: true },
];

export type ShowOn = "profiel" | "diensten" | "website" | "facturen";
export const SHOW_ON: readonly { id: ShowOn; label: string; bedrijfOnly?: boolean }[] = [
  { id: "profiel", label: "Op mijn profiel in ZekerFlex" },
  { id: "diensten", label: "Bij mijn diensten en vacatures", bedrijfOnly: true },
  { id: "website", label: "Als belknop op mijn website" },
  { id: "facturen", label: "Op mijn facturen" },
];

/** Bedragen in centen per maand. De eigenaar past ze aan in Admin → Telefonie. */
export interface Pricing {
  lineCents: number;
  /** wat de nummersoort bovenop de lijn kost; null = prijs op aanvraag */
  numberCents: Record<NumberKind, number | null>;
  optionCents: Record<OptionId, number>;
  bundleCents: Record<BundleId, number>;
  includedMinutes: number;
  extraMinuteCents: number;
}

export const DEFAULT_PRICING: Pricing = {
  lineCents: 1250,
  numberCents: { eigen: 0, mobiel097: 0, mobiel06: null, lokaal: null, zakelijk085: null, zakelijk088: null, gratis0800: null, overzetten: null },
  optionCents: { ai: 2995, voicemail: 295, doorschakelen: 495, keuzemenu: 495, team: 795, opnemen: 495, sms: 395 },
  bundleCents: { start: 1495, zakelijk: 2995, compleet: 5995 },
  includedMinutes: 100,
  extraMinuteCents: 10,
};

export interface Selection {
  kind: NumberKind;
  bundle: BundleId | null;
  options: OptionId[];
}

export interface QuoteLine {
  label: string;
  /** null = prijs op aanvraag */
  cents: number | null;
}

export interface Quote {
  lines: QuoteLine[];
  monthlyCents: number;
  /** de nummersoort heeft (nog) geen vaste prijs */
  onRequest: boolean;
  /** goedkoper met een (andere) bundel of juist zonder */
  tip: { bundle: BundleId | null; saveCents: number } | null;
}

export const bundleById = (id: BundleId | null | undefined): Bundle | null => BUNDLES.find((b) => b.id === id) ?? null;
export const numberTypeById = (id: NumberKind): NumberType | undefined => NUMBER_TYPES.find((t) => t.id === id);

/** Alle gekozen opties, inclusief die in de bundel. */
export function selectedOptions(sel: Selection): Set<OptionId> {
  return new Set<OptionId>([...(bundleById(sel.bundle)?.options ?? []), ...sel.options]);
}

/** Maandprijs voor een set opties met een bepaalde bundel (of zonder). */
function costWith(bundle: Bundle | null, wanted: Set<OptionId>, p: Pricing): number {
  const included = new Set(bundle?.options ?? []);
  let total = bundle ? p.bundleCents[bundle.id] : p.lineCents;
  for (const o of wanted) if (!included.has(o)) total += p.optionCents[o];
  return total;
}

export function quote(sel: Selection, p: Pricing = DEFAULT_PRICING): Quote {
  const bundle = bundleById(sel.bundle);
  const wanted = selectedOptions(sel);
  const included = new Set(bundle?.options ?? []);
  const lines: QuoteLine[] = [];

  lines.push(bundle ? { label: `Bundel ${bundle.label} (lijn + ${bundle.options.length} opties)`, cents: p.bundleCents[bundle.id] } : { label: "ZekerFlex-lijn", cents: p.lineCents });
  const numberCents = p.numberCents[sel.kind];
  const type = numberTypeById(sel.kind);
  if (numberCents === null) lines.push({ label: type?.label ?? "Nummer", cents: null });
  else if (numberCents > 0) lines.push({ label: type?.label ?? "Nummer", cents: numberCents });
  for (const o of OPTIONS) if (wanted.has(o.id) && !included.has(o.id)) lines.push({ label: o.label, cents: p.optionCents[o.id] });

  const current = costWith(bundle, wanted, p);
  let best: { bundle: BundleId | null; cost: number } = { bundle: sel.bundle, cost: current };
  for (const candidate of [null, ...BUNDLES]) {
    const cost = costWith(candidate, wanted, p);
    if (cost < best.cost) best = { bundle: candidate?.id ?? null, cost };
  }

  return {
    lines,
    monthlyCents: lines.reduce((sum, l) => sum + (l.cents ?? 0), 0),
    onRequest: numberCents === null,
    tip: best.cost < current ? { bundle: best.bundle, saveCents: current - best.cost } : null,
  };
}

/** Zelfde uitkomst op server en in de browser (geen toLocaleString: andere ICU-data gaf hydratatieverschillen). */
export const euro = (cents: number): string => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
