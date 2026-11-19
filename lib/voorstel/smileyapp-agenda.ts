import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvSetIfAbsent, kvVervangAlsVeld, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { isTijdId, metNotitie, statusNaAnnuleren, type Aanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { alleAanvragen, bewerkAanvraag } from "@/lib/voorstel/smileyapp-aanvragen";
import { afspraakTekst, dagEnTijd, isBoekbaar, leesMoment, openVoorSite, openzetFout, tijdId, tijdVerlopen, type OpenTijd, type Tijd } from "@/lib/voorstel/smileyapp-agenda-regels";
import type { Taal } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, dagTaal } from "@/lib/voorstel/smileyapp-talen";
import { vul } from "@/lib/voorstel/smileyapp-teksten";

// ---------------------------------------------------------------------------
// Opslag van de agenda voor demo-afspraken (deel 6a). KV:
// voorstel-smileyapp:agenda:<id>, één rij per tijd; het id is het begin in UTC,
// dus dezelfde tijd kan er maar één keer staan. In een rij staat wie van het
// team hem openzette en, als hij geboekt is, het id van de aanvraag: geen naam
// of adres van de aanvrager (die staan alleen bij de aanvraag zelf).
// Boeken is atomair: de rij wordt alleen vervangen als zijn status nog "open"
// is (kvVervangAlsVeld). Kiezen twee mensen tegelijk dezelfde tijd, dan wint er
// één; de ander krijgt een nette melding en de lijst van nu.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:agenda:";
const sleutel = (id: string) => `${PREFIX}${id}`;

/** Alle tijden, de vroegste eerst. Wat voorbij is wordt meteen opgeruimd (tijdVerlopen). */
export async function alleTijden(nu = new Date()): Promise<Tijd[]> {
  const rijen = await kvListEntries<Tijd>(PREFIX, 2000);
  const oud = rijen.filter((r) => tijdVerlopen(r.value, nu));
  await Promise.all(oud.map((r) => kvDelete(r.key).catch(() => undefined)));
  return rijen
    .filter((r) => !tijdVerlopen(r.value, nu))
    .map((r) => r.value)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** De tijden die de site toont. Lukt het lezen niet, dan is de lijst leeg en houdt het formulier zijn voorkeursmoment. */
export async function openTijden(nu = new Date()): Promise<OpenTijd[]> {
  return openVoorSite(await alleTijden(nu).catch(() => []), nu);
}

export interface AfspraakKeuze {
  waarde: string;
  label: string;
}

/** De open tijden als keuzelijst voor het formulier, in de taal van de pagina en altijd in Nederlandse tijd. */
export async function afsprakenVoorSite(taal: Taal, nu = new Date()): Promise<AfspraakKeuze[]> {
  return (await openTijden(nu)).map((t) => ({ waarde: t.id, label: afspraakInTaal(t.start, taal) }));
}

/** "maandag 23 november om 10:00 uur" in het Nederlands, "Monday 23 November at 10:00" in het Engels, enzovoort. */
export function afspraakInTaal(start: string, taal: Taal): string {
  if (taal === "nl") return afspraakTekst(start);
  const { dag, tijd } = dagEnTijd(start);
  return vul(TEKSTEN[taal].formulier.moment, { dag: dagTaal(dag, taal), tijd });
}

/** Zet een tijd open (datum en begintijd in Nederlandse tijd). De regels staan in leesMoment en openzetFout. */
export async function zetTijdOpen(o: { datum: string; tijd: string }, door: string, nu = new Date()): Promise<Tijd> {
  const moment = leesMoment(o.datum, o.tijd, nu);
  if (!moment.ok) throw AppError.validation(moment.fout, { veld: moment.veld });
  const fout = openzetFout(moment.start, await alleTijden(nu), nu);
  if (fout) throw AppError.validation(fout, { veld: "tijd" });
  const nieuw: Tijd = { id: tijdId(moment.start), start: moment.start.toISOString(), status: "open", door, aangemaakt: nu.toISOString() };
  // twee teamleden tegelijk: de tweede schrijft niets over
  if (!(await kvSetIfAbsent(sleutel(nieuw.id), nieuw))) throw AppError.validation("Deze tijd staat al in de agenda.", { veld: "tijd" });
  return nieuw;
}

/** Haalt een open tijd weg. Een geboekte tijd blijft staan: die moet eerst geannuleerd worden. */
export async function haalTijdWeg(id: string): Promise<void> {
  if (!isTijdId(id)) throw AppError.notFound("Deze tijd bestaat niet (meer).");
  if (await kvVerwijderAlsVeld(sleutel(id), "status", "open")) return;
  const t = await kvGet<Tijd>(sleutel(id));
  if (!t) throw AppError.notFound("Deze tijd bestaat niet (meer).");
  throw AppError.validation("Deze tijd is geboekt. Annuleer eerst de boeking.");
}

/**
 * Boekt een tijd voor een aanvraag. Geeft de geboekte tijd terug, of null als hij niet (meer) vrij is: al geboekt,
 * weggehaald of te dichtbij. Atomair: alleen als de status in de opslag op dat moment nog "open" is.
 */
export async function boekTijd(id: string, aanvraagId: string, nu = new Date()): Promise<Tijd | null> {
  if (!isTijdId(id)) return null;
  const t = await kvGet<Tijd>(sleutel(id));
  if (!t || !isBoekbaar(t, nu)) return null;
  const geboekt: Tijd = { ...t, status: "geboekt", aanvraag: aanvraagId, geboektOp: nu.toISOString() };
  return (await kvVervangAlsVeld(sleutel(id), "status", "open", geboekt)) ? geboekt : null;
}

/**
 * Maakt een geboekte tijd weer vrij, alleen als hij nog van deze aanvraag is. Voor het terugdraaien als de aanvraag
 * bewaren mislukt, en als het team een aanvraag met een afspraak verwijdert. Gooit niet.
 */
export async function geefTijdVrij(id: string, aanvraagId: string): Promise<boolean> {
  if (!isTijdId(id)) return false;
  try {
    const t = await kvGet<Tijd>(sleutel(id));
    if (!t || t.status !== "geboekt" || t.aanvraag !== aanvraagId) return false;
    const open: Tijd = { id: t.id, start: t.start, status: "open", door: t.door, aangemaakt: t.aangemaakt };
    return await kvVervangAlsVeld(sleutel(id), "aanvraag", aanvraagId, open);
  } catch {
    return false;
  }
}

/**
 * Het team annuleert een boeking: de tijd komt weer vrij, de afspraak gaat van de aanvraag af, de status volgt
 * statusNaAnnuleren en er komt een notitie bij met wie het deed. De aanvrager krijgt hier geen bericht van.
 */
export async function annuleerBoeking(id: string, door: string, nu = new Date()): Promise<void> {
  const t = isTijdId(id) ? await kvGet<Tijd>(sleutel(id)) : null;
  if (!t) throw AppError.notFound("Deze tijd bestaat niet (meer).");
  if (t.status !== "geboekt" || !t.aanvraag) throw AppError.validation("Deze tijd is niet geboekt.");
  const aanvraagId = t.aanvraag;
  if (!(await geefTijdVrij(id, aanvraagId))) throw AppError.validation("Annuleren lukte niet. Ververs de agenda en probeer het opnieuw.");
  await bewerkAanvraag(
    aanvraagId,
    (a) => {
      const { afspraak, ...rest } = a;
      if (afspraak?.tijd !== id) return a;
      const notitie = metNotitie(a.notities ?? [], { id: randomBytes(6).toString("hex"), tekst: `Demo-afspraak van ${afspraakTekst(t.start)} geannuleerd.`, door, op: nu.toISOString() });
      return { ...rest, status: statusNaAnnuleren(a.status), ...(notitie.ok ? { notities: notitie.waarde } : {}) };
    },
    door,
    nu,
  );
}

/** Een tijd zoals het beheer hem toont: bij een boeking ook wie hem boekte (naam en bedrijf uit de aanvraag). */
export interface BeheerTijd extends Tijd {
  boeker?: { naam: string; bedrijf: string };
}

export function metBoekers(tijden: readonly Tijd[], aanvragen: readonly Aanvraag[]): BeheerTijd[] {
  const perId = new Map(aanvragen.map((a) => [a.id, a]));
  return tijden.map((t) => {
    const a = t.aanvraag ? perId.get(t.aanvraag) : undefined;
    return a ? { ...t, boeker: { naam: a.naam, bedrijf: a.bedrijf } } : { ...t };
  });
}

/** De agenda voor het beheer: alle tijden met wie ze boekte. Alleen na de sessiecontrole aanroepen. */
export async function agendaVoorBeheer(nu = new Date()): Promise<BeheerTijd[]> {
  const [tijden, aanvragen] = await Promise.all([alleTijden(nu), alleAanvragen(nu)]);
  return metBoekers(tijden, aanvragen);
}
