// ---------------------------------------------------------------------------
// De regels van het fiscale formulier van de werker (components/app/FiscalForm.tsx), puur en los te testen. Geen prisma, geen
// kv, geen fs: ook de browser mag dit inlezen. Alleen types komen uit lib/fiscal/store.ts (die server-only is).
//
// 14 nov 2026 (kaart van de onboarding, punten 12, 5 en 7): het formulier vraagt niets dubbel meer.
//  - het IBAN telt niet meer als "mist" en is optioneel: het rekeningnummer bevestig je bij Verificatie, vóór je eerste betaalde
//    klus (lib/fiscal/eligibility.ts blijft dat eisen; isComplete in store.ts ook voor de loonstrook);
//  - de werkvorm is geen keuze meer als hij al gekozen is ("je koos X", met wijzigen);
//  - KVK, btw en KOR die al zijn ingevuld (bij de aanmelding) staan als samenvatting met wijzigen, niet als tweede invoer.
// ---------------------------------------------------------------------------

import type { WorkerKind } from "@/lib/fiscal/store";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export type FormulierMist = "btwZzp" | "btwFlex" | "bsn";

export interface FormulierFeiten {
  kind: WorkerKind;
  vatNumber: string;
  vatRequested: boolean;
  kvkNumber: string;
  /** de KOR is bevestigd */
  kor: boolean;
  /** een KOR-aanvraag is ingediend (telt als ingevuld, zoals "btw aangevraagd") */
  korIngediend: boolean;
  hasBsn: boolean;
  /** het BSN dat nu in het veld staat */
  bsn: string;
}

/**
 * Wat het formulier nog mist voor de gekozen werkvorm. Het IBAN hoort hier bewust NIET bij: het is niet nodig om je gegevens in
 * te vullen en komt vóór de eerste betaalde klus (lib/fiscal/eligibility.ts houdt dat tegen).
 */
export function formulierMist(f: FormulierFeiten): FormulierMist[] {
  const mist: FormulierMist[] = [];
  if (f.kind === "zzp" && !(f.vatNumber.trim() || (f.vatRequested && f.kvkNumber.trim()))) mist.push("btwZzp");
  if (f.kind === "flexwerker" && !(f.vatNumber.trim() || f.kor || f.vatRequested || f.korIngediend)) mist.push("btwFlex");
  if (f.kind === "uitzendkracht" && !(f.hasBsn || f.bsn.trim())) mist.push("bsn");
  return mist;
}

/** Het IBAN voor de opslag: alleen meesturen als er iets staat (de route eist 15 tekens of meer als het er is). */
export function ibanVoorOpslag(iban: string): { iban?: string } {
  const schoon = iban.trim();
  return schoon ? { iban: schoon } : {};
}

/**
 * De body van het opslaan (PUT /api/me/fiscal). De loonheffingskorting zit er bewust NIET in (kaartpunt 11): die kies je pas na
 * de getekende uitzendovereenkomst in het uitzendpaneel (components/app/UitzendPanel.tsx), en de route laat een sleutel die niet
 * is meegestuurd staan. Zo zet dit formulier een eerdere keuze nooit stil terug.
 */
export function opslagBody(f: {
  kind: WorkerKind;
  iban: string;
  kor: boolean;
  vatRequested: boolean;
  vatNumber: string;
  kvkNumber: string;
  bsn: string;
  ibanCode: string;
  /** het veld Bedrijfsnaam (zzp en flexwerker); zonder deze sleutel gaat er niets over de naam mee */
  bedrijfsnaam?: string | undefined;
  /** de bedrijfsnaam zoals hij bewaard was: alleen een bewaarde naam kan bewust worden leeggemaakt */
  bedrijfsnaamWas?: string | null | undefined;
  /** het veld "KOR sinds" (YYYY-MM-DD of leeg); gaat alleen mee bij een flexwerker die de KOR al gebruikt */
  korSinds?: string | undefined;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { workerKind: f.kind, ...ibanVoorOpslag(f.iban), korApplies: f.kor, vatRequested: f.vatRequested };
  if (f.vatNumber.trim()) body.vatNumber = f.vatNumber.trim();
  if (f.kvkNumber.trim()) body.kvkNumber = f.kvkNumber.trim();
  if (f.kind === "uitzendkracht" && f.bsn.trim()) body.bsn = f.bsn.trim();
  if (f.ibanCode.trim()) body.ibanCode = f.ibanCode.trim();
  if (zakelijkeWerkvorm(f.kind) && f.bedrijfsnaam !== undefined) Object.assign(body, bedrijfsnaamVoorOpslag(f.bedrijfsnaam, f.bedrijfsnaamWas));
  if (f.kind === "flexwerker" && f.kor && f.korSinds !== undefined) body.korSinds = f.korSinds.trim();
  return body;
}

// ---------------------------------------------------------------------------
// Het scherm "Zakelijke gegevens" (17 nov 2026, eigenaar: "laten we ook zo een scherm creëren"). Voor een zzp'er en een
// flexwerker heet Fiscaal zo, met een bedrijfsnaam, "KOR sinds" en het IBAN gemaskeerd met "Wijzig IBAN". Hetzelfde formulier
// en dezelfde route: geen tweede bron. Een uitzendkracht houdt "Werkvorm & fiscale gegevens".
// ---------------------------------------------------------------------------

/** Werkt deze werkvorm met een eigen onderneming (zzp'er, flexwerker)? Dan heet het scherm "Zakelijke gegevens". */
export function zakelijkeWerkvorm(kind: WorkerKind | null | undefined): boolean {
  return kind === "zzp" || kind === "flexwerker";
}

/** De langste bedrijfsnaam die we bewaren: ruim genoeg voor een handelsnaam, en het veld heeft dezelfde grens. */
export const BEDRIJFSNAAM_MAX = 120;

/** Een bedrijfsnaam opgeschoond: alle witruimte (ook regeleinden en tabs) wordt één spatie, de randen gaan eraf. */
export function schoonBedrijfsnaam(ruw: string | null | undefined): string {
  return (ruw ?? "").replace(/\s+/g, " ").trim();
}

/** Past de opgeschoonde bedrijfsnaam binnen de grens? Leeg mag: dan is hij niet ingevuld. */
export function bedrijfsnaamPast(ruw: string): boolean {
  return schoonBedrijfsnaam(ruw).length <= BEDRIJFSNAAM_MAX;
}

/**
 * Wat er van de bedrijfsnaam meegaat bij het opslaan. Een ingevulde naam gaat opgeschoond mee; een leeg veld alleen als er een
 * naam bewaard was (bewust leeggemaakt, de route maakt er null van). Was er nooit een naam, dan gaat er niets mee: zo blijft
 * de naam uit een later gecontroleerde KVK-inschrijving voor te vullen.
 */
export function bedrijfsnaamVoorOpslag(veld: string, was: string | null | undefined): { bedrijfsnaam?: string } {
  const naam = schoonBedrijfsnaam(veld);
  if (naam) return { bedrijfsnaam: naam };
  return schoonBedrijfsnaam(was) ? { bedrijfsnaam: "" } : {};
}

/**
 * De bedrijfsnaam in het veld bij het openen: wat de werker bewaarde; was er nooit iets ingevuld (de sleutel ontbreekt), dan de
 * naam uit zijn gecontroleerde KVK-inschrijving. Een bewust leeggemaakte naam (null) blijft leeg: we schrijven nooit over wat
 * de werker zelf koos.
 */
export function bedrijfsnaamVooraf(opgeslagen: string | null | undefined, uitKvk: string | null | undefined): string {
  if (opgeslagen === undefined) return schoonBedrijfsnaam(uitKvk).slice(0, BEDRIJFSNAAM_MAX);
  return opgeslagen ?? "";
}

/** De vroegste datum bij "KOR sinds": de btw, en daarmee de oude kleineondernemersregeling, bestaat in Nederland sinds 1969. */
export const KOR_SINDS_VROEGST = "1969-01-01";

/**
 * Klopt een datum bij "KOR sinds"? Een bestaande dag (YYYY-MM-DD), niet vóór 1969 en niet na vandaag in Nederland. `vandaag`
 * is een Nederlandse dagsleutel (amsterdamDayKey): de server draait in UTC, en tussen middernacht en 01:00 (02:00 in de zomer)
 * is het daar nog gisteren.
 */
export function korSindsGeldig(waarde: string, vandaag: string = amsterdamDayKey(new Date())): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(waarde);
  if (!m) return false;
  const jaar = Number(m[1]);
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) return false;
  return waarde >= KOR_SINDS_VROEGST && waarde <= vandaag;
}

/**
 * "KOR sinds" bij het openen: de bewaarde datum; anders, als de KOR via de KOR-hulp is bevestigd, de ingangsdatum van die
 * melding, maar alleen als die al voorbij is (een datum in de toekomst zou het opslaan tegenhouden).
 */
export function korSindsVooraf(opgeslagen: string | null | undefined, ingangMelding: string | null | undefined, vandaag: string | null | undefined): string {
  if (opgeslagen) return opgeslagen;
  if (ingangMelding && vandaag && korSindsGeldig(ingangMelding, vandaag)) return ingangMelding;
  return "";
}

/** Een dag (YYYY-MM-DD) als 17-11-2026, zonder tijdzone of taalinstelling: gelijk op de server en in de browser. */
export function dagKort(dag: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dag;
}

/**
 * Een bewaard IBAN om te tonen: de landcode en de laatste 4 tekens zichtbaar, de rest als stippen in groepjes van 4 vanaf het
 * eind ("NL91ABNA0417164300" wordt "NL •••• •••• •••• 4300"). Alleen weergave: het rekeningnummer zelf verandert niet.
 */
export function maskeerIban(iban: string): string {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (s.length <= 4) return s;
  const laatste = s.slice(-4);
  const land = s.length > 6 && /^[A-Z]{2}/.test(s) ? s.slice(0, 2) : "";
  const groepen: string[] = [];
  for (let rest = s.length - 4 - land.length; rest > 0; rest -= 4) groepen.unshift("•".repeat(Math.min(4, rest)));
  return [land, ...groepen, laatste].filter(Boolean).join(" ");
}

/** Staat de werkvorm al vast? Dan geen keuze meer tonen, tenzij de werker op "wijzigen" drukte. */
export function toonWerkvormKeuze(opgeslagen: WorkerKind | null | undefined, wijzigen: boolean): boolean {
  return !opgeslagen || wijzigen;
}

/** Een KVK-nummer uit het profiel zonder de plaatshouders van de aanmelding ("pending-…", "vat-…"): alleen 8 cijfers. */
export function schoonKvk(ruw: string | null | undefined): string {
  const s = (ruw ?? "").replace(/[\s.]/g, "");
  return /^\d{8}$/.test(s) ? s : "";
}

export interface BedrijfFeiten {
  kvk: string;
  btw: string;
  /** de KOR is bevestigd */
  kor: boolean;
  btwAangevraagd: boolean;
  korIngediend: boolean;
}

/**
 * Is het bedrijfsdeel voor deze werkvorm al ingevuld (bij de aanmelding)? Dan toont Fiscaal een samenvatting met wijzigen in
 * plaats van een tweede invoer. Een uitzendkracht heeft geen KVK of btw: daar is niets samen te vatten.
 */
export function bedrijfAlIngevuld(kind: WorkerKind, b: BedrijfFeiten): boolean {
  if (kind === "zzp") return Boolean(b.kvk.trim() || b.btw.trim());
  if (kind === "flexwerker") return Boolean(b.kvk.trim() || b.btw.trim() || b.kor || b.btwAangevraagd || b.korIngediend);
  return false;
}
