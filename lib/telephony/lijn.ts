import type { OptionId } from "@/lib/telephony/plans";

// ---------------------------------------------------------------------------
// Een actieve klantlijn (16 nov 2026, eigenaar: "zorg dat het wordt gemaakt"): wat de klant instelt en hoe een
// inkomend gesprek loopt. Tot nu kwam elk gesprek naar een klantnummer bij het keuzemenu van ZekerFlex zelf uit.
// Nu: binnen de openingstijden het keuzemenu of doorschakelen (met een teamnummer meerdere telefoons tegelijk),
// en als niemand opneemt of daarbuiten de assistent (naam en vraag → terugbelverzoek), de voicemail of een nette
// melding. Puur bestand (ook voor de browser): de server staat in lib/telephony/lijn-server.ts, de webhooks in
// app/api/telephony/lijn. De beller hoort Nederlands; de stem is die van de eigen ZekerFlex-lijn (TELEPHONY_VOICE).
// ---------------------------------------------------------------------------

export const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;
export type Weekdag = (typeof WEEKDAGEN)[number];

export interface Tijdvak {
  /** "09:00" */
  van: string;
  tot: string;
}

export interface MenuKeuze {
  /** 1–9 */
  toets: number;
  /** wat de beller hoort: "planning" in "Toets 1 voor planning" */
  label: string;
  /** E.164; met een teamnummer meerdere tegelijk */
  naar: string[];
}

export interface LijnInstellingen {
  /** de naam zoals de beller hem hoort ("u belt met …", "de digitale assistent van …") */
  naam: string;
  /** E.164; zonder teamnummer alleen het eerste */
  doorschakelen: string[];
  /** zo lang gaat de telefoon over voordat de assistent of voicemail het overneemt */
  belSeconden: number;
  openingstijden: Record<Weekdag, Tijdvak | null>;
  menu: MenuKeuze[];
  /** gesprekken opnemen (alleen met de optie opnemen; de beller hoort het vooraf) */
  opnemen: boolean;
}

export const MAX_NUMMERS = 5;
export const MAX_MENU = 9;
export const BEL_SECONDEN = { min: 10, max: 40, standaard: 20 } as const;

export const STANDAARD_UREN: Record<Weekdag, Tijdvak | null> = {
  ma: { van: "09:00", tot: "17:00" },
  di: { van: "09:00", tot: "17:00" },
  wo: { van: "09:00", tot: "17:00" },
  do: { van: "09:00", tot: "17:00" },
  vr: { van: "09:00", tot: "17:00" },
  za: null,
  zo: null,
};

export function standaardInstellingen(naam: string, doorschakelen: string | null): LijnInstellingen {
  return { naam, doorschakelen: doorschakelen ? [doorschakelen] : [], belSeconden: BEL_SECONDEN.standaard, openingstijden: { ...STANDAARD_UREN }, menu: [], opnemen: false };
}

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
export const geldigeTijd = (t: string) => TIJD.test(t);

/** De weekdag uit amsterdamParts (0 = zondag). */
export const weekdagVan = (index: number): Weekdag => WEEKDAGEN[(index + 6) % 7] ?? "ma";

/** Valt "14:05" op deze dag binnen de openingstijden? Een tijdvak tot 00:00 loopt tot middernacht. */
export function binnenTijd(uren: Record<Weekdag, Tijdvak | null>, dag: Weekdag, tijd: string): boolean {
  const v = uren[dag];
  if (!v || !geldigeTijd(v.van) || !geldigeTijd(v.tot)) return false;
  const tot = v.tot === "00:00" ? "24:00" : v.tot;
  return tijd >= v.van && tijd < tot;
}

export type Terugval = "assistent" | "voicemail" | "ophangen";

export interface Belplan {
  /** "dit gesprek kan worden opgenomen" vooraf */
  melding: boolean;
  /** binnen de openingstijden, met de optie keuzemenu */
  menu: MenuKeuze[] | null;
  /** binnen de openingstijden doorschakelen (zonder menu) */
  bellen: { nummers: string[]; seconden: number } | null;
  /** als niemand opneemt, buiten de openingstijden of zonder doorschakelen */
  terugval: Terugval;
}

/** Hoe een gesprek op deze lijn loopt, nu. Alleen wat de klant heeft (opties) en heeft ingesteld. */
export function belplan(opties: ReadonlySet<OptionId>, eerstAssistent: boolean, inst: LijnInstellingen, nu: { dag: Weekdag; tijd: string }): Belplan {
  const open = binnenTijd(inst.openingstijden, nu.dag, nu.tijd);
  const terugval: Terugval = opties.has("ai") ? "assistent" : opties.has("voicemail") ? "voicemail" : "ophangen";
  const melding = opties.has("opnemen") && inst.opnemen;
  // "de AI-assistent neemt eerst op": geen doorschakelen, meteen de assistent
  if (eerstAssistent && opties.has("ai")) return { melding, menu: null, bellen: null, terugval: "assistent" };
  const team = opties.has("team");
  const menu = open && opties.has("keuzemenu") ? inst.menu.filter((m) => m.naar.length > 0).map((m) => ({ ...m, naar: team ? m.naar.slice(0, MAX_NUMMERS) : m.naar.slice(0, 1) })) : [];
  const nummers = team ? inst.doorschakelen.slice(0, MAX_NUMMERS) : inst.doorschakelen.slice(0, 1);
  const bellen = open && !menu.length && opties.has("doorschakelen") && nummers.length ? { nummers, seconden: inst.belSeconden } : null;
  return { melding, menu: menu.length ? menu : null, bellen, terugval };
}

/** Wat de beller hoort. Vaste, korte zinnen (geen taalmodel: dat verzon dingen namens de zaak, zie lib/telephony/demo.ts). */
export const ZINNEN = {
  melding: "Dit gesprek kan worden opgenomen.",
  menu: (naam: string, menu: readonly MenuKeuze[]) => `U belt met ${naam}. ${menu.map((m) => `Toets ${m.toets} voor ${m.label}.`).join(" ")}`,
  assistent: (naam: string) => `Goedendag, u spreekt met de digitale assistent van ${naam}. Er is nu niemand beschikbaar, maar ik zet uw vraag graag door. Waarmee kan ik u helpen?`,
  naamVraag: "Dank u. Mag ik uw naam?",
  bedankt: (beller: string) => `Dank u wel${beller ? `, ${beller}` : ""}. Ik zet een terugbelverzoek klaar met het nummer waarmee u belt. Fijne dag nog!`,
  voicemail: (naam: string) => `U belt met ${naam}. Er is nu niemand bereikbaar. Spreek na de piep een bericht in en hang op als u klaar bent.`,
  voicemailBedankt: "Dank u wel, uw bericht is doorgegeven. Fijne dag nog!",
  niemand: (naam: string) => `U belt met ${naam}. Er is nu niemand bereikbaar. Probeer het later nog eens.`,
} as const;

export type BerichtSoort = "terugbelverzoek" | "voicemail" | "opname" | "sms" | "gemist";

/** Een bericht bij een lijn (lib/telephony/lijn-server.ts). Het nummer van de beller is voor de klant zelf. */
export interface LijnBericht {
  id: string;
  soort: BerichtSoort;
  /** E.164 van de beller of afzender */
  van: string;
  /** de vraag (assistent), de uitgeschreven voicemail of opname, de sms */
  tekst: string;
  /** de naam die de beller noemde (assistent) */
  naam?: string;
  /** opname bij Twilio (voicemail, opname), af te spelen via /api/telefonie/opname */
  opnameSid?: string;
  duurS?: number;
  /** het CallSid of MessageSid, om dubbele callbacks te herkennen */
  bron: string;
  op: string;
  /** uitgaande sms vanuit ZekerFlex */
  uit?: boolean;
}

/** Een nummer om te tonen: "+31612345678" → "06 12 34 56 78"; buitenlands blijft zoals het is. */
export function nummerTekst(e164: string): string {
  const m = /^\+31(6)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  if (m) return `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  const n = /^\+31(\d{2,3})(\d+)$/.exec(e164);
  return n ? `0${n[1]} ${n[2]}` : e164;
}
