// ---------------------------------------------------------------------------
// Afspraken boeken en de klantenkaart (11 nov 2026, branchemotor: kapper, schoonheid, sport, zorgpraktijk, garage …).
// Dit is het zuivere deel, zonder opslag: wat een bedrijf mag instellen en hoe uit openingstijden, diensten en
// bestaande afspraken de vrije tijden volgen. Alle tijden zijn Nederlandse klokkentijd (lib/time/amsterdam): de
// server draait in UTC, een tijd als "09:30" is dus altijd een wandkloktijd in Amsterdam, ook rond de zomertijd.
// ---------------------------------------------------------------------------

import { amsterdamClock, amsterdamDayKey, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

export const WEEKDAG_NAAM = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"] as const;
/** De volgorde waarin een week in Nederland loopt: maandag eerst. Waarden zijn weekdagnummers (0 = zondag). */
export const WEEK_VOLGORDE = [1, 2, 3, 4, 5, 6, 0] as const;
export const STAPPEN = [5, 10, 15, 20, 30, 60] as const;

export interface Dienst {
  id: string;
  naam: string;
  duurMin: number;
  /** in centen; null = geen prijs getoond */
  prijsCent: number | null;
}

export interface Medewerker {
  id: string;
  naam: string;
}

/** Een tijdvak binnen één dag, als "09:00" en "17:30". */
export interface Tijdvak {
  van: string;
  tot: string;
}

export interface Instellingen {
  /** het adres van de boekpagina: /boeken/<slug> */
  slug: string;
  /** staat de boekpagina open voor klanten? */
  actief: boolean;
  bedrijfsnaam: string;
  diensten: Dienst[];
  medewerkers: Medewerker[];
  /** per weekdag (index 0 = zondag … 6 = zaterdag) de tijdvakken waarin je afspraken doet; leeg = gesloten */
  uren: Tijdvak[][];
  /** hoe vaak per uur een afspraak kan beginnen, in minuten */
  stapMin: number;
  /** zo lang van tevoren moet een klant minstens boeken, in minuten */
  voorlopMin: number;
  /** hoeveel dagen vooruit een klant kan boeken */
  maxDagenVooruit: number;
  /** tot zoveel minuten vóór de start mag een klant zelf annuleren (via de link in zijn mail); ontbreekt bij oudere instellingen: ANNULEER_STANDAARD */
  annuleerTotMin?: number;
  /** stuurt het bedrijf klanten met een e-mailadres 24 uur van tevoren een herinnering? Ontbreekt bij oudere instellingen: aan */
  herinneringAan?: boolean;
}

/** Standaard: een klant kan tot 2 uur voor de start zelf annuleren. */
export const ANNULEER_STANDAARD = 120;
export const annuleerTotMinVan = (i: Pick<Instellingen, "annuleerTotMin">): number => i.annuleerTotMin ?? ANNULEER_STANDAARD;
export const herinneringAanVan = (i: Pick<Instellingen, "herinneringAan">): boolean => i.herinneringAan !== false;
/** De herinnering gaat zo lang voor de start weg. */
export const HERINNERING_VOORAF_MS = 24 * 3_600_000;

export type AfspraakStatus = "bevestigd" | "geweest" | "niet-gekomen" | "geannuleerd";
export const STATUS_NAAM: Record<AfspraakStatus, string> = {
  bevestigd: "Bevestigd",
  geweest: "Geweest",
  "niet-gekomen": "Niet gekomen",
  geannuleerd: "Geannuleerd",
};
export const isStatus = (s: unknown): s is AfspraakStatus => typeof s === "string" && Object.hasOwn(STATUS_NAAM, s);

export interface Klant {
  naam: string;
  telefoon: string;
  email: string;
}

export interface Afspraak {
  /** "2026-11-12~k3j9x0ab": de dag staat in het id, zo is de afspraak zonder zoeken terug te vinden */
  id: string;
  dienstId: string;
  /** namen worden meebewaard: de geschiedenis blijft kloppen als je later een dienst hernoemt of weghaalt */
  dienstNaam: string;
  duurMin: number;
  prijsCent: number | null;
  medewerkerId: string;
  medewerkerNaam: string;
  /** ISO met Z */
  start: string;
  eind: string;
  klant: Klant;
  opmerking: string;
  status: AfspraakStatus;
  bron: "online" | "balie";
  gemaaktOp: string;
  /**
   * Alleen de hashes van de geheime annuleerlinks (bevestiging en herinnering krijgen elk een eigen link); de links zelf
   * staan nergens, alleen in de mail aan de klant. Hoort bij de persoonsgegevens: zonderPersoon haalt ze weg, dan is de link dood.
   */
  tokenHashes?: string[];
  /** de herinnering is verstuurd (of wordt net verstuurd): nooit twee herinneringen */
  herinneringVerstuurd?: boolean;
}

const MAAND_NAAM = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "donderdag 12 november 2026 om 09:00" in Nederlandse tijd, op elke server hetzelfde (mail en pagina voor de klant). */
export function datumTijdLang(iso: string): string {
  const d = new Date(iso);
  const p = amsterdamParts(d);
  return `${WEEKDAG_NAAM[p.weekday] ?? ""} ${p.day} ${MAAND_NAAM[p.month - 1] ?? ""} ${p.year} om ${amsterdamClock(d)}`;
}

/** Waarom een klant niet (meer) kan annuleren, of null als het kan. */
export type AnnuleerBezwaar = "al-geannuleerd" | "verstreken" | "te-laat";

/** Mag de klant deze afspraak nu zelf annuleren? Pure regel, voor de pagina en de route. */
export function annuleerBezwaar(a: Pick<Afspraak, "status" | "start">, i: Pick<Instellingen, "annuleerTotMin">, nu: Date): AnnuleerBezwaar | null {
  if (a.status === "geannuleerd") return "al-geannuleerd";
  const start = new Date(a.start).getTime();
  if (a.status !== "bevestigd" || start <= nu.getTime()) return "verstreken";
  if (start - nu.getTime() < annuleerTotMinVan(i) * 60_000) return "te-laat";
  return null;
}

/**
 * Krijgt deze afspraak ooit een herinnering? Alleen als hij MEER dan 24 uur vóór de start gemaakt is (precies 24 uur
 * telt niet mee): bij een kortere boeking is de bevestiging de herinnering, anders komen er twee mails kort achter elkaar.
 */
export const herinneringGewenst = (a: Pick<Afspraak, "start" | "gemaaktOp">): boolean => new Date(a.start).getTime() - new Date(a.gemaaktOp).getTime() > HERINNERING_VOORAF_MS;

/** Hoort deze afspraak nu een herinnering te krijgen? Alleen bevestigd, met e-mailadres, nog niet gestuurd, binnen 24 uur vóór de start (en nog niet begonnen), en lang genoeg van tevoren gemaakt (herinneringGewenst). */
export function herinneringDue(a: Afspraak, i: Pick<Instellingen, "herinneringAan">, nu: Date): boolean {
  if (a.status !== "bevestigd" || !a.klant.email || a.herinneringVerstuurd === true || !herinneringAanVan(i) || !herinneringGewenst(a)) return false;
  const start = new Date(a.start).getTime();
  return start > nu.getTime() && start - nu.getTime() <= HERINNERING_VOORAF_MS;
}

export const AFSPRAAK_ID = /^\d{4}-\d{2}-\d{2}~[a-z0-9]{6,12}$/;
export const DAG_SLEUTEL = /^\d{4}-\d{2}-\d{2}$/;
/** De dag waarop een afspraak valt, uit zijn id. */
export const dagVanId = (id: string): string | null => (AFSPRAAK_ID.test(id) ? id.slice(0, 10) : null);

// --- schoonmaken -----------------------------------------------------------------

/** Spaties samenvoegen en stuurtekens weghalen. */
export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** "09:30" → 570 minuten; "24:00" mag (einde van de dag). Anders null. */
export function tijdNaarMin(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const uur = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || uur > 24 || (uur === 24 && min !== 0)) return null;
  return uur * 60 + min;
}

export const minNaarTijd = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Een slug uit een bedrijfsnaam: "Kapper Jan & Zn." → "kapper-jan-zn". */
export function slugUit(naam: string): string {
  const s = naam
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : "";
}

export type Gecontroleerd<T> = { ok: true; waarde: T } | { ok: false; fout: string };

/**
 * Controleert wat een bedrijf als instellingen opgeeft. `nieuwId` geeft een vers id voor een dienst of medewerker
 * zonder id (een nieuwe). De fouten zijn gewone Nederlandse zinnen, voor het formulier.
 */
export function controleerInstellingen(invoer: unknown, nieuwId: () => string): Gecontroleerd<Instellingen> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const bedrijfsnaam = schoneTekst(o.bedrijfsnaam, 80);
  if (bedrijfsnaam.length < 2) return { ok: false, fout: "Vul de naam van je bedrijf in." };
  const slug = schoneTekst(o.slug, 40).toLowerCase();
  if (!SLUG.test(slug)) return { ok: false, fout: "Het adres van je boekpagina mag alleen kleine letters, cijfers en streepjes hebben, en is minstens 3 tekens lang." };

  const ids = new Set<string>();
  const uniek = (id: unknown): string => {
    const schoon = typeof id === "string" && /^[a-z0-9]{4,16}$/.test(id) && !ids.has(id) ? id : nieuwId();
    ids.add(schoon);
    return schoon;
  };

  const dienstenRuw = Array.isArray(o.diensten) ? o.diensten : [];
  if (dienstenRuw.length < 1) return { ok: false, fout: "Voeg minstens één dienst toe, bijvoorbeeld \"Knippen\"." };
  if (dienstenRuw.length > 30) return { ok: false, fout: "Je kunt hooguit 30 diensten hebben." };
  const diensten: Dienst[] = [];
  for (const d of dienstenRuw) {
    const r = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const naam = schoneTekst(r.naam, 60);
    if (naam.length < 2) return { ok: false, fout: "Elke dienst heeft een naam nodig." };
    const duur = Number(r.duurMin);
    if (!Number.isInteger(duur) || duur < 5 || duur > 480) return { ok: false, fout: `De duur van "${naam}" moet tussen 5 minuten en 8 uur liggen.` };
    let prijsCent: number | null = null;
    if (r.prijsCent !== null && r.prijsCent !== undefined && r.prijsCent !== "") {
      const p = Number(r.prijsCent);
      if (!Number.isInteger(p) || p < 0 || p > 10_000_000) return { ok: false, fout: `De prijs van "${naam}" klopt niet.` };
      prijsCent = p;
    }
    diensten.push({ id: uniek(r.id), naam, duurMin: duur, prijsCent });
  }

  const medRuw = Array.isArray(o.medewerkers) ? o.medewerkers : [];
  if (medRuw.length < 1) return { ok: false, fout: "Voeg minstens één medewerker toe (dat mag jezelf zijn)." };
  if (medRuw.length > 30) return { ok: false, fout: "Je kunt hooguit 30 medewerkers hebben." };
  const medewerkers: Medewerker[] = [];
  for (const m of medRuw) {
    const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const naam = schoneTekst(r.naam, 60);
    if (naam.length < 2) return { ok: false, fout: "Elke medewerker heeft een naam nodig." };
    medewerkers.push({ id: uniek(r.id), naam });
  }

  const urenRuw = Array.isArray(o.uren) ? o.uren : [];
  const uren: Tijdvak[][] = [];
  for (let dag = 0; dag < 7; dag++) {
    const vakken = Array.isArray(urenRuw[dag]) ? (urenRuw[dag] as unknown[]) : [];
    if (vakken.length > 3) return { ok: false, fout: `Op ${WEEKDAG_NAAM[dag]} kun je hooguit drie tijdvakken hebben.` };
    const lijst: { van: number; tot: number }[] = [];
    for (const v of vakken) {
      const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const van = tijdNaarMin(r.van);
      const tot = tijdNaarMin(r.tot);
      if (van === null || tot === null) return { ok: false, fout: `Een tijd op ${WEEKDAG_NAAM[dag]} klopt niet. Gebruik bijvoorbeeld 09:00.` };
      if (tot <= van) return { ok: false, fout: `Op ${WEEKDAG_NAAM[dag]} moet het einde na het begin liggen.` };
      lijst.push({ van, tot });
    }
    lijst.sort((a, b) => a.van - b.van);
    for (let i = 1; i < lijst.length; i++) if (lijst[i]!.van < lijst[i - 1]!.tot) return { ok: false, fout: `De tijdvakken op ${WEEKDAG_NAAM[dag]} overlappen.` };
    uren.push(lijst.map((l) => ({ van: minNaarTijd(l.van), tot: minNaarTijd(l.tot) })));
  }
  if (uren.every((d) => d.length === 0)) return { ok: false, fout: "Zet minstens één dag open." };

  const stapMin = Number(o.stapMin);
  if (!(STAPPEN as readonly number[]).includes(stapMin)) return { ok: false, fout: "Kies hoe vaak per uur een afspraak kan beginnen." };
  const voorlopMin = Number(o.voorlopMin);
  if (!Number.isInteger(voorlopMin) || voorlopMin < 0 || voorlopMin > 10_080) return { ok: false, fout: "De voorlooptijd moet tussen 0 minuten en een week liggen." };
  const maxDagenVooruit = Number(o.maxDagenVooruit);
  if (!Number.isInteger(maxDagenVooruit) || maxDagenVooruit < 1 || maxDagenVooruit > 365) return { ok: false, fout: "Het aantal dagen vooruit moet tussen 1 en 365 liggen." };

  // bestaande opzetten (en oude schermen) sturen deze velden niet mee: dan de standaard
  const annuleerTotMin = o.annuleerTotMin === undefined || o.annuleerTotMin === null ? ANNULEER_STANDAARD : Number(o.annuleerTotMin);
  if (!Number.isInteger(annuleerTotMin) || annuleerTotMin < 0 || annuleerTotMin > 10_080) return { ok: false, fout: "De tijd tot wanneer een klant kan annuleren moet tussen 0 minuten en een week liggen." };
  const herinneringAan = o.herinneringAan !== false;

  return { ok: true, waarde: { slug, actief: o.actief === true, bedrijfsnaam, diensten, medewerkers, uren, stapMin, voorlopMin, maxDagenVooruit, annuleerTotMin, herinneringAan } };
}

/** Een nette beginstand: ma–vr 09:00–17:00, zo'n 30 minuten per afspraak, een dienst en jijzelf als medewerker. */
export function beginInstellingen(bedrijfsnaam: string, nieuwId: () => string): Instellingen {
  const week: Tijdvak[] = [{ van: "09:00", tot: "17:00" }];
  return {
    slug: slugUit(bedrijfsnaam),
    actief: false,
    bedrijfsnaam,
    diensten: [{ id: nieuwId(), naam: "Afspraak", duurMin: 30, prijsCent: null }],
    medewerkers: [{ id: nieuwId(), naam: bedrijfsnaam }],
    uren: [[], week, week, week, week, week, []],
    stapMin: 30,
    voorlopMin: 60,
    maxDagenVooruit: 60,
    annuleerTotMin: ANNULEER_STANDAARD,
    herinneringAan: true,
  };
}

// --- vrije tijden ----------------------------------------------------------------

export interface Slot {
  /** ISO met Z */
  start: string;
  medewerkerId: string;
}

export const eindVan = (start: Date, duurMin: number): Date => new Date(start.getTime() + duurMin * 60_000);

/** Telt een afspraak mee als bezet? Een geannuleerde afspraak maakt de tijd weer vrij. */
export const bezet = (a: Pick<Afspraak, "status">): boolean => a.status !== "geannuleerd";

/** Het dagnummer van een dagsleutel "2026-11-12" (0 = zondag), of null als de datum niet bestaat. */
export function weekdagVan(dag: string): number | null {
  const m = DAG_SLEUTEL.exec(dag);
  if (!m) return null;
  const [j, mnd, d] = dag.split("-").map(Number) as [number, number, number];
  const datum = new Date(Date.UTC(j, mnd - 1, d));
  return datum.getUTCFullYear() === j && datum.getUTCMonth() === mnd - 1 && datum.getUTCDate() === d ? datum.getUTCDay() : null;
}

/** De weekdagnummers (0 = zondag) waarop het bedrijf minstens één tijdvak heeft; de andere dagen zijn gesloten. */
export function openDagen(i: Pick<Instellingen, "uren">): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => (i.uren[d]?.length ?? 0) > 0);
}

/** De laatste dag die een klant mag boeken, als dagsleutel. */
export function laatsteDag(nu: Date, dagenVooruit: number): string {
  const p = amsterdamParts(nu);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + dagenVooruit)).toISOString().slice(0, 10);
}

/**
 * De tijden waarop een klant op `dag` kan beginnen met `dienstId`, bij één medewerker of (null) bij wie dan ook.
 * Een tijd telt als hij in een tijdvak past, niet botst met een afspraak van die medewerker, en ver genoeg in de
 * toekomst ligt. Zonder voorkeur krijgt elke tijd de eerste medewerker die vrij is.
 */
export function vrijeTijden(i: Instellingen, o: { dienstId: string; medewerkerId: string | null; dag: string; afspraken: readonly Afspraak[]; nu: Date; metVoorlooptijd?: boolean }): Slot[] {
  const dienst = i.diensten.find((d) => d.id === o.dienstId);
  const weekdag = weekdagVan(o.dag);
  if (!dienst || weekdag === null) return [];
  const vandaag = amsterdamDayKey(o.nu);
  if (o.dag < vandaag || o.dag > laatsteDag(o.nu, i.maxDagenVooruit)) return [];
  const medewerkers = o.medewerkerId ? i.medewerkers.filter((m) => m.id === o.medewerkerId) : i.medewerkers;
  const vroegst = o.nu.getTime() + (o.metVoorlooptijd === false ? 0 : i.voorlopMin * 60_000);
  const [j, mnd, d] = o.dag.split("-").map(Number) as [number, number, number];
  const gezien = new Set<string>();
  const uit: Slot[] = [];
  for (const m of medewerkers) {
    const bezette = o.afspraken.filter((a) => a.medewerkerId === m.id && bezet(a));
    for (const vak of i.uren[weekdag] ?? []) {
      const van = tijdNaarMin(vak.van);
      const tot = tijdNaarMin(vak.tot);
      if (van === null || tot === null) continue;
      for (let t = van; t + dienst.duurMin <= tot; t += i.stapMin) {
        const start = amsterdamToUtc(j, mnd, d, Math.floor(t / 60), t % 60);
        if (start.getTime() < vroegst) continue;
        const eind = eindVan(start, dienst.duurMin);
        if (bezette.some((a) => new Date(a.start).getTime() < eind.getTime() && new Date(a.eind).getTime() > start.getTime())) continue;
        const sleutel = start.toISOString();
        if (!o.medewerkerId && gezien.has(sleutel)) continue;
        gezien.add(sleutel);
        uit.push({ start: sleutel, medewerkerId: m.id });
      }
    }
  }
  return uit.sort((a, b) => a.start.localeCompare(b.start) || a.medewerkerId.localeCompare(b.medewerkerId));
}

/** Is precies deze tijd bij deze medewerker nog vrij? Dezelfde regels als vrijeTijden, dus de server vertrouwt de klant niet. */
export function isVrij(i: Instellingen, o: { dienstId: string; medewerkerId: string; start: Date; afspraken: readonly Afspraak[]; nu: Date; metVoorlooptijd?: boolean }): boolean {
  const dag = amsterdamDayKey(o.start);
  return vrijeTijden(i, { dienstId: o.dienstId, medewerkerId: o.medewerkerId, dag, afspraken: o.afspraken, nu: o.nu, ...(o.metVoorlooptijd === false ? { metVoorlooptijd: false } : {}) }).some((s) => s.start === o.start.toISOString());
}

// --- de klant ----------------------------------------------------------------

/** Een telefoonnummer: cijfers, plus, spaties, streepjes en haakjes; 8 tot 16 cijfers. Anders leeg. */
export function schoneTelefoon(v: unknown): string {
  const t = schoneTekst(v, 24);
  if (!/^[+\d][\d\s()-]*$/.test(t)) return "";
  const cijfers = t.replace(/\D/g, "").length;
  return cijfers >= 8 && cijfers <= 16 ? t : "";
}

export function schoneEmail(v: unknown): string {
  const t = schoneTekst(v, 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : "";
}

/** Controleert wat een klant invult bij het boeken. */
export function controleerKlant(o: { naam: unknown; telefoon: unknown; email: unknown }): Gecontroleerd<Klant> {
  const naam = schoneTekst(o.naam, 80);
  if (naam.length < 2) return { ok: false, fout: "Vul je naam in." };
  const telefoon = schoneTelefoon(o.telefoon);
  const email = schoneEmail(o.email);
  // eerst: iets ingevuld dat niet klopt, dan pas: niets ingevuld
  if (typeof o.telefoon === "string" && o.telefoon.trim() && !telefoon) return { ok: false, fout: "Dit telefoonnummer klopt niet." };
  if (typeof o.email === "string" && o.email.trim() && !email) return { ok: false, fout: "Dit e-mailadres klopt niet." };
  if (!telefoon && !email) return { ok: false, fout: "Vul een telefoonnummer of een e-mailadres in, zodat het bedrijf je kan bereiken." };
  return { ok: true, waarde: { naam, telefoon, email } };
}

/** Eén klant is één e-mailadres of anders één telefoonnummer: zo vallen afspraken van dezelfde persoon op één kaart. */
export function klantSleutel(k: Pick<Klant, "telefoon" | "email">): string {
  if (k.email) return `e-${k.email}`;
  const cijfers = k.telefoon.replace(/\D/g, "");
  return cijfers ? `t-${cijfers.replace(/^0031|^31/, "0")}` : "";
}

export interface KlantKaart {
  sleutel: string;
  naam: string;
  telefoon: string;
  email: string;
  notitie: string;
  aantal: number;
  geweest: number;
  nietGekomen: number;
  /** ISO van de laatste afspraak die al geweest is of bevestigd, of null */
  laatste: string | null;
  volgende: string | null;
}

/** Bouwt de klantenkaarten uit alle afspraken en de bewaarde notities. De nieuwste gegevens van een klant gaan voor. */
export function klantenUit(afspraken: readonly Afspraak[], notities: ReadonlyMap<string, string>, nu: Date): KlantKaart[] {
  const per = new Map<string, KlantKaart>();
  const nieuwsteEerst = [...afspraken].sort((a, b) => b.start.localeCompare(a.start));
  for (const a of nieuwsteEerst) {
    const sleutel = klantSleutel(a.klant);
    if (!sleutel) continue;
    let k = per.get(sleutel);
    if (!k) {
      k = { sleutel, naam: a.klant.naam, telefoon: a.klant.telefoon, email: a.klant.email, notitie: notities.get(sleutel) ?? "", aantal: 0, geweest: 0, nietGekomen: 0, laatste: null, volgende: null };
      per.set(sleutel, k);
    }
    if (a.status === "geannuleerd") continue;
    k.aantal += 1;
    if (a.status === "geweest") k.geweest += 1;
    if (a.status === "niet-gekomen") k.nietGekomen += 1;
    const toekomst = new Date(a.start).getTime() > nu.getTime();
    if (toekomst) k.volgende = !k.volgende || a.start < k.volgende ? a.start : k.volgende;
    else if (!k.laatste || a.start > k.laatste) k.laatste = a.start;
  }
  // een klant met alleen een notitie (zonder afspraak) blijft ook op de lijst
  for (const [sleutel, notitie] of notities) if (!per.has(sleutel)) per.set(sleutel, { sleutel, naam: "", telefoon: "", email: "", notitie, aantal: 0, geweest: 0, nietGekomen: 0, laatste: null, volgende: null });
  return [...per.values()].filter((k) => k.naam || k.notitie).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

// --- bewaartermijn (AVG) -------------------------------------------------------

/** Zo lang bewaart een afspraak de gegevens van de klant (naam, telefoon, e-mail, opmerking): 2 jaar na de afspraak. */
export const BEWAARTERMIJN_DAGEN = 730;

/** Afspraken die vóór dit moment begonnen, hebben hun bewaartermijn gehad. */
export const bewaarGrens = (nu: Date): Date => new Date(nu.getTime() - BEWAARTERMIJN_DAGEN * 86_400_000);

/**
 * De afspraak zonder persoonsgegevens: dienst, tijd en status blijven, zodat de agenda en de cijfers van het bedrijf kloppen.
 * Ook de hashes van de annuleerlinks en de mailvlag gaan weg: wie gewist is, kan via een oude mail niets meer zien of
 * doen, en de afspraak hoort niet meer bij een e-mailadres.
 */
export const zonderPersoon = (a: Afspraak): Afspraak => {
  const { tokenHashes: _links, herinneringVerstuurd: _vlag, ...rest } = a;
  void _links;
  void _vlag;
  return { ...rest, klant: { naam: "Verwijderd", telefoon: "", email: "" }, opmerking: "" };
};

/** Heeft deze afspraak nog persoonsgegevens (of annuleerlinks)? Een al gewiste regel hoeft niet opnieuw geschreven te worden. */
export const heeftPersoon = (a: Afspraak): boolean => a.klant.naam !== "Verwijderd" || a.klant.telefoon !== "" || a.klant.email !== "" || a.opmerking !== "" || (a.tokenHashes?.length ?? 0) > 0 || a.herinneringVerstuurd !== undefined;
