import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { prijsIndicatie } from "@/lib/voorstel/schwarzwald-agenda";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { alleAccounts, type PubliekAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { alleBoekingen, type Boeking } from "@/lib/voorstel/schwarzwald-boekingen";

// ---------------------------------------------------------------------------
// CRM van Het Schwarzwald: één klantbeeld per e-mailadres, samengesteld uit
// accounts, reserveringen en aanvragen, plus wat het personeel zelf bijhoudt
// (klantkaart, notities, taken, berichten). Alles in de KeyValueStore:
//   voorstel-schwarzwald:klant:<email>          klantkaart
//   voorstel-schwarzwald:crm:<email>:<id>        tijdlijn (notitie/taak/bericht)
//   voorstel-schwarzwald:aanvraag:<id>           aanvraag (lead) uit het formulier
// ---------------------------------------------------------------------------

const P_KLANT = "voorstel-schwarzwald:klant:";
const P_ITEM = "voorstel-schwarzwald:crm:";
const P_AANVRAAG = "voorstel-schwarzwald:aanvraag:";

const norm = (email: string) => email.trim().toLowerCase();
const id = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export type KlantStatus = "lead" | "klant" | "vaste-klant" | "inactief";
export type KlantSoort = "particulier" | "zakelijk";

export interface Klantkaart {
  email: string;
  naam: string;
  telefoon: string;
  bedrijf: string;
  soort: KlantSoort;
  /** leeg = automatisch (lead/klant/vaste klant op basis van reserveringen) */
  status: KlantStatus | "";
  tags: string[];
  /** dieet, allergieën, voorkeuren: ook door de klant zelf in te vullen */
  wensen: string;
  /** alleen voor het team */
  notitie: string;
  bijgewerkt: string;
}

export type ItemSoort = "notitie" | "taak" | "bericht-klant" | "bericht-team";

export interface CrmItem {
  id: string;
  email: string;
  soort: ItemSoort;
  tekst: string;
  door: string;
  datum: string;
  /** taken */
  vervalt?: string;
  klaar?: boolean;
}

export type AanvraagStatus = "nieuw" | "in-behandeling" | "offerte" | "geboekt" | "verloren";

export interface Aanvraag {
  id: string;
  email: string;
  naam: string;
  telefoon: string;
  gelegenheid: string;
  programma: string;
  datum: string;
  personen: number;
  bericht: string;
  status: AanvraagStatus;
  /** offertebedrag in euro's */
  bedrag: number | null;
  aangemaakt: string;
  bijgewerkt: string;
  account?: string;
}

// --- klantkaart ------------------------------------------------------------

const LEGE_KAART = (email: string): Klantkaart => ({
  email,
  naam: "",
  telefoon: "",
  bedrijf: "",
  soort: "particulier",
  status: "",
  tags: [],
  wensen: "",
  notitie: "",
  bijgewerkt: new Date().toISOString(),
});

export async function klantkaart(email: string): Promise<Klantkaart | null> {
  return kvGet<Klantkaart>(`${P_KLANT}${norm(email)}`);
}

type KaartWijziging = { [K in Exclude<keyof Klantkaart, "email" | "bijgewerkt">]?: Klantkaart[K] | undefined };

export async function wijzigKlantkaart(email: string, w: KaartWijziging): Promise<Klantkaart> {
  const e = norm(email);
  const huidig = (await klantkaart(e)) ?? LEGE_KAART(e);
  const nieuw: Klantkaart = { ...huidig, ...Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)), email: e, bijgewerkt: new Date().toISOString() };
  nieuw.tags = [...new Set(nieuw.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await kvSet(`${P_KLANT}${e}`, nieuw);
  return nieuw;
}

// --- tijdlijn ----------------------------------------------------------------

export async function tijdlijn(email: string): Promise<CrmItem[]> {
  return (await kvListValues<CrmItem>(`${P_ITEM}${norm(email)}:`, 1000)).sort((a, b) => b.datum.localeCompare(a.datum));
}

export async function voegItemToe(input: Omit<CrmItem, "id" | "datum" | "email"> & { email: string }): Promise<CrmItem> {
  const tekst = input.tekst.trim();
  if (!tekst) throw AppError.validation("Schrijf eerst iets.");
  const item: CrmItem = { ...input, email: norm(input.email), tekst, id: id(), datum: new Date().toISOString() };
  if (item.soort === "taak") item.klaar = false;
  await kvSet(`${P_ITEM}${item.email}:${item.id}`, item);
  return item;
}

export async function zetTaak(email: string, itemId: string, klaar: boolean): Promise<CrmItem> {
  const sleutel = `${P_ITEM}${norm(email)}:${itemId}`;
  const item = await kvGet<CrmItem>(sleutel);
  if (!item || item.soort !== "taak") throw AppError.notFound("Taak niet gevonden.");
  const nieuw = { ...item, klaar };
  await kvSet(sleutel, nieuw);
  return nieuw;
}

export async function verwijderItem(email: string, itemId: string): Promise<void> {
  await kvDelete(`${P_ITEM}${norm(email)}:${itemId}`);
}

export async function alleItems(): Promise<CrmItem[]> {
  return kvListValues<CrmItem>(P_ITEM, 10000);
}

// --- aanvragen (leads) -------------------------------------------------------

export async function maakAanvraag(input: Omit<Aanvraag, "id" | "status" | "bedrag" | "aangemaakt" | "bijgewerkt">): Promise<Aanvraag> {
  const nu = new Date().toISOString();
  const a: Aanvraag = { ...input, email: norm(input.email), id: id(), status: "nieuw", bedrag: null, aangemaakt: nu, bijgewerkt: nu };
  await kvSet(`${P_AANVRAAG}${a.id}`, a);
  return a;
}

export async function alleAanvragen(): Promise<Aanvraag[]> {
  return (await kvListValues<Aanvraag>(P_AANVRAAG, 5000)).sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
}

export async function aanvragenVan(email: string): Promise<Aanvraag[]> {
  return (await kvFindByField<Aanvraag>(P_AANVRAAG, "email", norm(email), 200)).sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
}

export async function wijzigAanvraag(aanvraagId: string, w: { status?: AanvraagStatus | undefined; bedrag?: number | null | undefined }): Promise<Aanvraag> {
  if (!/^[a-z0-9]{6,24}$/.test(aanvraagId)) throw AppError.validation("Onbekende aanvraag.");
  const a = await kvGet<Aanvraag>(`${P_AANVRAAG}${aanvraagId}`);
  if (!a) throw AppError.notFound("Aanvraag niet gevonden.");
  const nieuw: Aanvraag = {
    ...a,
    ...(w.status ? { status: w.status } : {}),
    ...(w.bedrag !== undefined ? { bedrag: w.bedrag } : {}),
    bijgewerkt: new Date().toISOString(),
  };
  await kvSet(`${P_AANVRAAG}${aanvraagId}`, nieuw);
  return nieuw;
}

export async function verwijderAanvraag(aanvraagId: string): Promise<void> {
  if (!/^[a-z0-9]{6,24}$/.test(aanvraagId)) throw AppError.validation("Onbekende aanvraag.");
  await kvDelete(`${P_AANVRAAG}${aanvraagId}`);
}

// --- klantbeeld --------------------------------------------------------------

export interface KlantRegel {
  email: string;
  naam: string;
  telefoon: string;
  bedrijf: string;
  soort: KlantSoort;
  status: KlantStatus;
  tags: string[];
  wensen: string;
  account: boolean;
  reserveringen: number;
  gasten: number;
  omzet: number;
  aanvragen: number;
  openTaken: number;
  /** laatste bericht kwam van de klant en is nog niet beantwoord */
  wachtOpAntwoord: boolean;
  laatsteContact: string;
}

const automatischeStatus = (reserveringen: number): KlantStatus => (reserveringen >= 3 ? "vaste-klant" : reserveringen >= 1 ? "klant" : "lead");

/** Alle klanten, samengevoegd per e-mailadres. */
export async function klanten(): Promise<KlantRegel[]> {
  const [accounts, boekingen, aanvragen, kaarten, items, cfg] = await Promise.all([
    alleAccounts(),
    alleBoekingen(),
    alleAanvragen(),
    kvListValues<Klantkaart>(P_KLANT, 10000),
    alleItems(),
    agendaConfig(),
  ]);
  const regels = new Map<string, KlantRegel>();
  const regel = (email: string): KlantRegel => {
    const e = norm(email);
    let r = regels.get(e);
    if (!r) {
      r = { email: e, naam: "", telefoon: "", bedrijf: "", soort: "particulier", status: "lead", tags: [], wensen: "", account: false, reserveringen: 0, gasten: 0, omzet: 0, aanvragen: 0, openTaken: 0, wachtOpAntwoord: false, laatsteContact: "" };
      regels.set(e, r);
    }
    return r;
  };
  const contact = (r: KlantRegel, datum: string) => {
    if (datum > r.laatsteContact) r.laatsteContact = datum;
  };

  for (const a of accounts) {
    const r = regel(a.email);
    r.account = true;
    r.naam ||= a.naam;
    r.telefoon ||= a.telefoon;
    contact(r, a.laatstIngelogd ?? a.aangemaakt);
  }
  for (const b of boekingen) {
    const r = regel(b.account ?? b.email);
    r.naam ||= b.naam;
    r.telefoon ||= b.telefoon;
    if (b.status !== "geannuleerd") {
      r.reserveringen++;
      r.gasten += b.personen;
      r.omzet += prijsIndicatie(b.activiteit, b.personen, b.datum, cfg) ?? 0;
    }
    contact(r, b.aangemaakt);
  }
  for (const a of aanvragen) {
    const r = regel(a.email);
    r.naam ||= a.naam;
    r.telefoon ||= a.telefoon;
    r.aanvragen++;
    if (a.status === "geboekt" && a.bedrag) r.omzet += a.bedrag;
    contact(r, a.aangemaakt);
  }
  const perKlant = new Map<string, CrmItem[]>();
  for (const i of items) perKlant.set(i.email, [...(perKlant.get(i.email) ?? []), i]);
  for (const [email, lijst] of perKlant) {
    const r = regel(email);
    r.openTaken = lijst.filter((i) => i.soort === "taak" && !i.klaar).length;
    const berichten = lijst.filter((i) => i.soort === "bericht-klant" || i.soort === "bericht-team").sort((a, b) => b.datum.localeCompare(a.datum));
    r.wachtOpAntwoord = berichten[0]?.soort === "bericht-klant";
    for (const i of lijst) contact(r, i.datum);
  }
  for (const r of regels.values()) r.status = automatischeStatus(r.reserveringen);
  // de klantkaart van het team gaat voor
  for (const k of kaarten) {
    const r = regel(k.email);
    if (k.naam) r.naam = k.naam;
    if (k.telefoon) r.telefoon = k.telefoon;
    r.bedrijf = k.bedrijf;
    r.soort = k.soort;
    if (k.status) r.status = k.status;
    r.tags = k.tags;
    r.wensen = k.wensen;
  }
  return [...regels.values()].sort((a, b) => b.laatsteContact.localeCompare(a.laatsteContact));
}

export interface KlantDossier {
  regel: KlantRegel;
  kaart: Klantkaart;
  account: PubliekAccount | null;
  reserveringen: (Boeking & { prijs: number | null })[];
  aanvragen: Aanvraag[];
  tijdlijn: CrmItem[];
}

export async function klantDossier(email: string): Promise<KlantDossier> {
  const e = norm(email);
  const [alle, boekingen, aanvragen, kaart, lijn, accounts, cfg] = await Promise.all([
    klanten(),
    alleBoekingen(),
    aanvragenVan(e),
    klantkaart(e),
    tijdlijn(e),
    alleAccounts(),
    agendaConfig(),
  ]);
  const regel = alle.find((r) => r.email === e);
  if (!regel) throw AppError.notFound("Klant niet gevonden.");
  return {
    regel,
    kaart: kaart ?? { ...LEGE_KAART(e), naam: regel.naam, telefoon: regel.telefoon },
    account: accounts.find((a) => a.email === e) ?? null,
    reserveringen: boekingen
      .filter((b) => norm(b.account ?? b.email) === e)
      .sort((a, b) => `${b.datum} ${b.tijd}`.localeCompare(`${a.datum} ${a.tijd}`))
      .map((b) => ({ ...b, prijs: prijsIndicatie(b.activiteit, b.personen, b.datum, cfg) })),
    aanvragen,
    tijdlijn: lijn,
  };
}

// --- dashboard ---------------------------------------------------------------

const plus = (datum: string, n: number) => {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function dashboardCijfers() {
  const vandaag = amsterdamDayKey(new Date());
  const [boekingen, aanvragen, items, alleKlanten, kaarten, cfg] = await Promise.all([
    alleBoekingen(),
    alleAanvragen(),
    alleItems(),
    klanten(),
    kvListValues<Klantkaart>(P_KLANT, 10000),
    agendaConfig(),
  ]);
  const geldig = boekingen.filter((b) => b.status !== "geannuleerd");
  const metPrijs = geldig.map((b) => ({ ...b, prijs: prijsIndicatie(b.activiteit, b.personen, b.datum, cfg) ?? 0 }));
  const binnen = (van: string, tot: string) => metPrijs.filter((b) => b.datum >= van && b.datum < tot);
  const som = (l: { personen: number; prijs: number }[]) => ({ aantal: l.length, gasten: l.reduce((s, b) => s + b.personen, 0), omzet: l.reduce((s, b) => s + b.prijs, 0) });
  const maandStart = `${vandaag.slice(0, 7)}-01`;
  const maandEind = plus(`${vandaag.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";

  const perDag = Array.from({ length: 14 }, (_, i) => {
    const d = plus(vandaag, i);
    const l = metPrijs.filter((b) => b.datum === d);
    return { datum: d, gasten: l.reduce((s, b) => s + b.personen, 0), reserveringen: l.length };
  });
  const perActiviteit = new Map<string, { gasten: number; omzet: number }>();
  for (const b of binnen(plus(vandaag, -30), plus(vandaag, 60))) {
    const a = perActiviteit.get(b.activiteit) ?? { gasten: 0, omzet: 0 };
    a.gasten += b.personen;
    a.omzet += b.prijs;
    perActiviteit.set(b.activiteit, a);
  }
  const pijplijn = (["nieuw", "in-behandeling", "offerte", "geboekt", "verloren"] as const).map((s) => {
    const l = aanvragen.filter((a) => a.status === s);
    return { status: s, aantal: l.length, waarde: l.reduce((t, a) => t + (a.bedrag ?? 0), 0) };
  });
  const afgerond = aanvragen.filter((a) => a.status === "geboekt" || a.status === "verloren");
  const wensenVan = new Map(kaarten.filter((k) => k.wensen.trim()).map((k) => [k.email, k.wensen]));
  const wensen = metPrijs
    .filter((b) => b.datum >= vandaag && b.datum < plus(vandaag, 8))
    .map((b) => ({ ...b, klantwens: wensenVan.get(norm(b.account ?? b.email)) ?? "" }))
    .filter((b) => b.opmerking.trim() || b.klantwens)
    .sort((a, b) => `${a.datum} ${a.tijd}`.localeCompare(`${b.datum} ${b.tijd}`));
  const taken = items
    .filter((i) => i.soort === "taak" && !i.klaar)
    .sort((a, b) => (a.vervalt ?? "9999").localeCompare(b.vervalt ?? "9999"))
    .map((t) => ({ ...t, naam: alleKlanten.find((k) => k.email === t.email)?.naam ?? t.email }));

  return {
    vandaag,
    vandaagCijfers: som(binnen(vandaag, plus(vandaag, 1))),
    week: som(binnen(vandaag, plus(vandaag, 7))),
    maand: som(binnen(maandStart, maandEind)),
    teBevestigen: geldig.filter((b) => b.status === "nieuw" && b.datum >= vandaag).length,
    perDag,
    topActiviteiten: [...perActiviteit.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.gasten - a.gasten).slice(0, 6),
    pijplijn,
    conversie: afgerond.length ? Math.round((afgerond.filter((a) => a.status === "geboekt").length / afgerond.length) * 100) : null,
    nieuweAanvragen: aanvragen.filter((a) => a.status === "nieuw").slice(0, 5),
    klanten: {
      totaal: alleKlanten.length,
      metAccount: alleKlanten.filter((k) => k.account).length,
      vast: alleKlanten.filter((k) => k.status === "vaste-klant").length,
      wachtOpAntwoord: alleKlanten.filter((k) => k.wachtOpAntwoord).map((k) => ({ email: k.email, naam: k.naam })),
    },
    wensen,
    taken,
  };
}
