import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { aanmeldFout, type Aanwezig } from "@/lib/voorstel/aanwezig-regels";
import { groepFout, inVenster, isDatum, isTijd, slotFout, wijzigFout, type BezetteTijd } from "@/lib/voorstel/schwarzwald-agenda";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";

// ---------------------------------------------------------------------------
// Boekingen van de Schwarzwald-voorstelagenda, in de KeyValueStore (geen eigen
// tabel, geen migratie). Sleutel per dag zodat "wat is er bezet op datum X"
// één prefix-query is: voorstel-schwarzwald:boeking:<datum>:<id>.
// Het is een voorbeeld: boekingen worden na BEWAAR_DAGEN gewist en er gaat
// geen mail naar Het Schwarzwald of de bezoeker.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:boeking:";
const BEWAAR_DAGEN = 30;

export type BoekingStatus = "nieuw" | "bevestigd" | "geannuleerd";

export interface Boeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
  status: BoekingStatus;
  aangemaakt: string;
  /** e-mail van het ingelogde account dat boekte (alleen dan ziet de klant hem in "Mijn account") */
  account?: string;
  /** online door de gast, of door het personeel in het beheer */
  door?: "online" | "beheer";
  /** "JJJJ-MM-DD HH:MM" waarvandaan de gast de boeking zelf verzette */
  verzetVan?: string;
  /** aantal personen voordat de gast het zelf wijzigde */
  aantalVan?: number;
  /** aangemeld bij de balie: gekomen of niet (leeg = nog niet aangemeld) */
  aanwezig?: Aanwezig;
  /** wie van het team de groep begeleidt; intern, de gast ziet dit niet */
  begeleider?: string;
}

/** Zoals de gast zijn boeking ziet en exporteert: zonder interne teamgegevens. */
export function voorGast(b: Boeking): Boeking {
  const r = { ...b };
  delete r.begeleider;
  return r;
}

const sleutel = (datum: string, id: string) => `${PREFIX}${datum}:${id}`;
const verlopen = (b: Boeking, nu: number) => nu - Date.parse(b.aangemaakt) > BEWAAR_DAGEN * 86_400_000;
const geldigId = (datum: string, id: string) => isDatum(datum) && /^[0-9A-F]{8}$/.test(id);

/** Telt mee voor de bezetting: alles behalve geannuleerd. */
export const bezetVan = (boekingen: Boeking[]): BezetteTijd[] =>
  boekingen.filter((b) => b.status !== "geannuleerd").map((b) => ({ activiteit: b.activiteit, tijd: b.tijd, personen: b.personen }));

/** Alle (niet-verlopen) boekingen; ruimt verlopen exemplaren meteen op. */
export async function alleBoekingen(): Promise<Boeking[]> {
  const rows = await kvListEntries<Boeking>(PREFIX, 5000);
  const nu = Date.now();
  const oud = rows.filter((r) => verlopen(r.value, nu));
  await Promise.all(oud.map((r) => kvDelete(r.key)));
  return rows.filter((r) => !verlopen(r.value, nu)).map((r) => r.value);
}

export async function boekingenOp(datum: string): Promise<Boeking[]> {
  const nu = Date.now();
  return (await kvListValues<Boeking>(`${PREFIX}${datum}:`, 2000)).filter((b) => !verlopen(b, nu));
}

export async function boekingenVanAccount(email: string): Promise<Boeking[]> {
  const nu = Date.now();
  return (await kvFindByField<Boeking>(PREFIX, "account", email.toLowerCase(), 500))
    .filter((b) => !verlopen(b, nu))
    .map(voorGast)
    .sort((a, b) => `${a.datum} ${a.tijd}`.localeCompare(`${b.datum} ${b.tijd}`));
}

export interface NieuweBoeking {
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
}

export async function maakBoeking(input: NieuweBoeking, opties: { account?: string | undefined; door?: "online" | "beheer" } = {}): Promise<Boeking> {
  const cfg = await agendaConfig();
  const vandaag = amsterdamDayKey(new Date());
  const fout = groepFout(input.activiteit, input.personen, cfg);
  if (fout) throw AppError.validation(fout);
  if (!isDatum(input.datum) || !isTijd(input.tijd)) throw AppError.validation("Kies een geldige datum en tijd.");
  // het personeel mag ook nog voor vandaag inboeken
  const venster = opties.door === "beheer" ? input.datum === vandaag || inVenster(input.datum, vandaag) : inVenster(input.datum, vandaag);
  if (!venster) throw AppError.validation("Deze datum is niet (meer) te boeken.");
  // opnieuw controleren op de server: het slot kan net vol zijn geraakt
  const slot = slotFout(input.activiteit, input.datum, input.tijd, input.personen, bezetVan(await boekingenOp(input.datum)), cfg);
  if (slot) throw AppError.validation(slot);

  const boeking: Boeking = {
    ...input,
    email: input.email.trim().toLowerCase(),
    id: randomBytes(4).toString("hex").toUpperCase(),
    status: opties.door === "beheer" ? "bevestigd" : "nieuw",
    aangemaakt: new Date().toISOString(),
    door: opties.door ?? "online",
    ...(opties.account ? { account: opties.account.toLowerCase() } : {}),
  };
  await kvSet(sleutel(boeking.datum, boeking.id), boeking);
  return boeking;
}

export async function zetStatus(datum: string, id: string, status: BoekingStatus): Promise<Boeking> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  const b = await kvGet<Boeking>(sleutel(datum, id));
  if (!b) throw AppError.notFound("Boeking niet gevonden.");
  const nieuw: Boeking = { ...b, status };
  // wie geannuleerd is, komt niet: een eerdere aanmelding vervalt
  if (status === "geannuleerd") delete nieuw.aanwezig;
  await kvSet(sleutel(datum, id), nieuw);
  return nieuw;
}

/** Het personeel meldt de gast aan bij de balie (ja/nee), of maakt dat ongedaan (null). */
export async function zetAanwezig(datum: string, id: string, waarde: Aanwezig | null): Promise<Boeking> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  const b = await kvGet<Boeking>(sleutel(datum, id));
  if (!b) throw AppError.notFound("Boeking niet gevonden.");
  const fout = waarde ? aanmeldFout(b, amsterdamDayKey(new Date())) : null;
  if (fout) throw AppError.validation(fout);
  const nieuw: Boeking = { ...b };
  if (waarde) nieuw.aanwezig = waarde;
  else delete nieuw.aanwezig;
  await kvSet(sleutel(datum, id), nieuw);
  return nieuw;
}

/** Het personeel zet wie de groep begeleidt ("" = niemand). */
export async function zetBegeleider(datum: string, id: string, naam: string): Promise<Boeking> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  const b = await kvGet<Boeking>(sleutel(datum, id));
  if (!b) throw AppError.notFound("Boeking niet gevonden.");
  const nieuw: Boeking = { ...b };
  const schoon = naam.replace(/\s+/g, " ").trim();
  if (schoon) nieuw.begeleider = schoon;
  else delete nieuw.begeleider;
  await kvSet(sleutel(datum, id), nieuw);
  return nieuw;
}

/** De klant annuleert zijn eigen, toekomstige boeking. */
export async function annuleerEigen(datum: string, id: string, email: string): Promise<Boeking> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  const b = await kvGet<Boeking>(sleutel(datum, id));
  if (!b || b.account !== email.toLowerCase()) throw AppError.notFound("Boeking niet gevonden.");
  if (b.datum <= amsterdamDayKey(new Date())) throw AppError.validation("Annuleren kan tot de dag ervoor. Bel ons voor vandaag.");
  return zetStatus(datum, id, "geannuleerd");
}

/**
 * De klant wijzigt zijn eigen, toekomstige boeking: andere dag of tijd
 * (verzetten) en/of een ander aantal personen. Zelfde regels als boeken
 * (wijzigFout); de boeking zelf telt niet mee voor de bezetting. Het team
 * bevestigt daarna opnieuw (status terug naar nieuw).
 */
export async function wijzigEigen(
  datum: string,
  id: string,
  email: string,
  w: { datum?: string | undefined; tijd?: string | undefined; personen?: number | undefined },
): Promise<{ oud: Boeking; nieuw: Boeking }> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  const b = await kvGet<Boeking>(sleutel(datum, id));
  if (!b || b.account !== email.toLowerCase()) throw AppError.notFound("Boeking niet gevonden.");
  const naar = { datum: w.datum ?? b.datum, tijd: w.tijd ?? b.tijd, personen: w.personen ?? b.personen };
  const anderen = isDatum(naar.datum) ? (await boekingenOp(naar.datum)).filter((x) => x.id !== b.id) : [];
  const fout = wijzigFout(b, naar, amsterdamDayKey(new Date()), bezetVan(anderen), await agendaConfig());
  if (fout) throw AppError.validation(fout);

  const verzet = naar.datum !== b.datum || naar.tijd !== b.tijd;
  const nieuw: Boeking = {
    ...b,
    ...naar,
    status: "nieuw",
    ...(verzet ? { verzetVan: `${b.datum} ${b.tijd}` } : {}),
    ...(naar.personen !== b.personen ? { aantalVan: b.personen } : {}),
  };
  await kvSet(sleutel(nieuw.datum, nieuw.id), nieuw);
  if (nieuw.datum !== b.datum) await kvDelete(sleutel(b.datum, b.id));
  return { oud: b, nieuw };
}

/** Eén boeking op alleen het nummer (de datum kan door verzetten veranderd zijn), of null. */
export async function zoekBoekingOpNummer(id: string): Promise<Boeking | null> {
  if (!/^[0-9A-F]{8}$/.test(id)) return null;
  return (await kvFindByField<Boeking>(PREFIX, "id", id, 1))[0] ?? null;
}

/** Eén boeking op datum en nummer, of null. */
export async function zoekBoeking(datum: string, id: string): Promise<Boeking | null> {
  if (!geldigId(datum, id)) return null;
  return kvGet<Boeking>(sleutel(datum, id));
}

export async function verwijderBoeking(datum: string, id: string): Promise<void> {
  if (!geldigId(datum, id)) throw AppError.validation("Onbekende boeking.");
  await kvDelete(sleutel(datum, id));
}
