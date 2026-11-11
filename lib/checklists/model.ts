// ---------------------------------------------------------------------------
// Checklists en rondes (11 nov 2026, branchemotor: schoonmaak, horeca, hotel, alles met vaste taken per locatie).
// Dit is het zuivere deel, zonder opslag: wat een sjabloon is, hoe een uitvoering wordt gecontroleerd, en hoe uit de
// herhaling en de uitvoeringen volgt wat verwacht was, wat gedaan is en wat gemist is. Alle dagen en tijdvensters zijn
// Nederlandse tijd (lib/time/amsterdam): de server draait in UTC, "uiterlijk 07:00" is dus een wandkloktijd in
// Amsterdam, ook rond de zomertijd. Opslag: lib/checklists/store.ts.
// ---------------------------------------------------------------------------

import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";

export const MAX_TAKEN = 60;
export const MAX_SJABLONEN = 100;
/** Een overzicht beslaat hooguit zoveel dagen. */
export const MAX_DAGEN = 31;
/** Uitvoeringen worden na zoveel jaar aangeboden om te wissen (namen van uitvoerders zijn persoonsgegevens). */
export const BEWAAR_JAREN = 2;

export const WEEKDAG_NAAM = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"] as const;
/** De volgorde waarin een week in Nederland loopt: maandag eerst. Waarden zijn weekdagnummers (0 = zondag). */
export const WEEK_VOLGORDE = [1, 2, 3, 4, 5, 6, 0] as const;

export type HerhalingSoort = "geen" | "dagelijks" | "werkdagen" | "weekdagen";
export const HERHALING_NAAM: Record<HerhalingSoort, string> = {
  geen: "Geen vast moment",
  dagelijks: "Elke dag",
  werkdagen: "Op werkdagen (maandag t/m vrijdag)",
  weekdagen: "Wekelijks, op gekozen dagen",
};
export const isHerhalingSoort = (s: unknown): s is HerhalingSoort => typeof s === "string" && Object.hasOwn(HERHALING_NAAM, s);

export interface Herhaling {
  soort: HerhalingSoort;
  /** alleen bij "weekdagen": weekdagnummers (0 = zondag … 6 = zaterdag) */
  dagen: number[];
  /** "uiterlijk om" in Nederlandse klokkentijd, "07:00"; null = de hele dag */
  uiterlijk: string | null;
  /** valt "uiterlijk" na middernacht, op de dag erna (een sluitronde die tot 02:00 mag duren)? */
  volgendeDag: boolean;
}

export interface Taak {
  id: string;
  tekst: string;
  /** moet er een opmerking bij als de taak niet gedaan is? */
  opmerkingVerplicht: boolean;
}

export interface Sjabloon {
  id: string;
  naam: string;
  /** de plek, bijvoorbeeld "Kantoor 2e verdieping"; mag leeg */
  locatie: string;
  taken: Taak[];
  herhaling: Herhaling;
  actief: boolean;
  /** ISO met Z */
  gemaaktOp: string;
  /** wanneer het sjabloon is gearchiveerd; vanaf dan wordt er niets meer verwacht */
  gearchiveerdOp: string | null;
  /** hash van de sleutel van de invullink (nooit de sleutel zelf); null = geen link */
  linkHash: string | null;
}

export interface TaakUitslag {
  id: string;
  /** de tekst wordt meebewaard: de geschiedenis blijft kloppen als je later een taak aanpast */
  tekst: string;
  gedaan: boolean;
  opmerking: string;
}

export interface Uitvoering {
  /** "2026-11-12~k3j9x0abcd": de Nederlandse dag van het tijdstip staat in het id */
  id: string;
  sjabloonId: string;
  sjabloonNaam: string;
  locatie: string;
  /** vrije tekst; persoonsgegeven (wisbaar) */
  uitvoerder: string;
  /** ISO met Z, de servertijd van het afronden */
  tijdstip: string;
  taken: TaakUitslag[];
  notitie: string;
  /** alle taken gedaan */
  compleet: boolean;
  /** een uitvoering is onveranderlijk: een correctie is een nieuwe uitvoering die hiernaar verwijst */
  correctieVan: string | null;
  bron: "link" | "beheer";
  /** van de invulpagina: een dubbele tik of nieuwe poging geeft dezelfde uitvoering terug, geen tweede */
  aanvraagId?: string | undefined;
}

export const UITVOERING_ID = /^\d{4}-\d{2}-\d{2}~[a-z0-9]{6,16}$/;
export const SJABLOON_ID = /^[a-z0-9]{6,16}$/;
export const DAG_SLEUTEL = /^\d{4}-\d{2}-\d{2}$/;
export const AANVRAAG_ID = /^[a-z0-9]{12,40}$/;

// --- schoonmaken -----------------------------------------------------------------

/** Spaties samenvoegen en stuurtekens weghalen. */
export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** "07:00" → "07:00" als het een geldige klokkentijd is (00:00 t/m 23:59), anders null. */
export function schoneKlok(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const uur = Number(m[1]);
  const min = Number(m[2]);
  return uur > 23 || min > 59 ? null : `${String(uur).padStart(2, "0")}:${m[2]}`;
}

export type Gecontroleerd<T> = { ok: true; waarde: T } | { ok: false; fout: string };

export interface SjabloonInvoer {
  naam: string;
  locatie: string;
  taken: Taak[];
  herhaling: Herhaling;
  actief: boolean;
}

/** Het sjabloon dat de beheerder instuurt: schoongemaakt of met een Nederlandse fout. `nieuwId` maakt het id van een nieuwe taak. */
export function controleerSjabloon(o: Record<string, unknown>, nieuwId: () => string): Gecontroleerd<SjabloonInvoer> {
  const naam = schoneTekst(o.naam, 60);
  if (naam.length < 2) return { ok: false, fout: "Geef de checklist een naam van minstens 2 tekens." };
  const locatie = schoneTekst(o.locatie, 80);

  const ruw = Array.isArray(o.taken) ? o.taken : [];
  const taken: Taak[] = [];
  const gebruikt = new Set<string>();
  for (const r of ruw) {
    const t = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const tekst = schoneTekst(t.tekst, 160);
    if (!tekst) continue; // een lege regel is geen taak
    let id = typeof t.id === "string" && SJABLOON_ID.test(t.id) && !gebruikt.has(t.id) ? t.id : "";
    while (!id || gebruikt.has(id)) id = nieuwId();
    gebruikt.add(id);
    taken.push({ id, tekst, opmerkingVerplicht: t.opmerkingVerplicht === true });
  }
  if (taken.length === 0) return { ok: false, fout: "Zet er minstens één taak in." };
  if (taken.length > MAX_TAKEN) return { ok: false, fout: `Een checklist heeft hoogstens ${MAX_TAKEN} taken. Maak er twee van.` };

  const h = o.herhaling && typeof o.herhaling === "object" ? (o.herhaling as Record<string, unknown>) : {};
  const soort = isHerhalingSoort(h.soort) ? h.soort : "geen";
  let dagen: number[] = [];
  if (soort === "weekdagen") {
    dagen = [...new Set((Array.isArray(h.dagen) ? h.dagen : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // maandag eerst
    if (dagen.length === 0) return { ok: false, fout: "Kies minstens één dag van de week." };
  }
  let uiterlijk: string | null = null;
  let volgendeDag = false;
  if (soort !== "geen" && h.uiterlijk !== null && h.uiterlijk !== undefined && h.uiterlijk !== "") {
    uiterlijk = schoneKlok(h.uiterlijk);
    if (!uiterlijk) return { ok: false, fout: "Vul de tijd in als uren en minuten, bijvoorbeeld 07:00." };
    volgendeDag = h.volgendeDag === true;
  }
  return { ok: true, waarde: { naam, locatie, taken, herhaling: { soort, dagen, uiterlijk, volgendeDag }, actief: o.actief !== false } };
}

/** Eén zin over de herhaling, voor in een lijst. */
export function herhalingTekst(h: Herhaling): string {
  const basis =
    h.soort === "geen" ? "Geen vast moment" : h.soort === "dagelijks" ? "Elke dag" : h.soort === "werkdagen" ? "Op werkdagen" : `Elke ${h.dagen.map((d) => WEEKDAG_NAAM[d] ?? "").join(", ")}`;
  if (h.soort === "geen" || !h.uiterlijk) return basis;
  return `${basis}, uiterlijk ${h.uiterlijk}${h.volgendeDag ? " (na middernacht)" : ""}`;
}

// --- een uitvoering controleren -------------------------------------------------

export interface UitvoeringInvoer {
  uitvoerder: string;
  taken: TaakUitslag[];
  notitie: string;
  compleet: boolean;
}

/**
 * De antwoorden van iemand die een checklist invult. Elke taak van het sjabloon moet met "gedaan" of "niet gedaan"
 * beantwoord zijn (wie niets aanvinkt, heeft niets bevestigd), taken die er niet in staan worden geweigerd, en een
 * taak met "opmerking verplicht" die niet gedaan is, heeft een opmerking nodig. Een taak telt maar één keer.
 */
export function controleerUitvoering(s: Sjabloon, o: Record<string, unknown>): Gecontroleerd<UitvoeringInvoer> {
  const uitvoerder = schoneTekst(o.uitvoerder, 60);
  if (uitvoerder.length < 2) return { ok: false, fout: "Vul je naam in, zodat te zien is wie de checklist deed." };
  const ruw = Array.isArray(o.taken) ? o.taken : [];
  const per = new Map<string, Record<string, unknown>>();
  for (const r of ruw) {
    const t = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    if (typeof t.id !== "string" || !s.taken.some((x) => x.id === t.id)) return { ok: false, fout: "Deze checklist is intussen aangepast. Vernieuw de pagina en vul hem opnieuw in." };
    if (per.has(t.id)) return { ok: false, fout: "Een taak is dubbel doorgegeven. Vernieuw de pagina en probeer het opnieuw." };
    per.set(t.id, t);
  }
  const taken: TaakUitslag[] = [];
  for (const taak of s.taken) {
    const t = per.get(taak.id);
    if (!t || typeof t.gedaan !== "boolean") return { ok: false, fout: "Beantwoord elke taak met gedaan of niet gedaan." };
    const opmerking = schoneTekst(t.opmerking, 200);
    if (!t.gedaan && taak.opmerkingVerplicht && !opmerking) return { ok: false, fout: `Vul een opmerking in bij "${taak.tekst}": waarom is dit niet gedaan?` };
    taken.push({ id: taak.id, tekst: taak.tekst, gedaan: t.gedaan, opmerking });
  }
  return { ok: true, waarde: { uitvoerder, taken, notitie: schoneTekst(o.notitie, 500), compleet: taken.every((t) => t.gedaan) } };
}

// --- verwacht, gedaan, gemist ----------------------------------------------------

/** Een dagsleutel "2026-11-12" met `n` dagen erbij of eraf (kalenderrekenen, geen tijdstip). */
export function plusDagen(dag: string, n: number): string {
  const d = new Date(Date.UTC(Number(dag.slice(0, 4)), Number(dag.slice(5, 7)) - 1, Number(dag.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

/** Weekdagnummer van een dagsleutel (0 = zondag). */
export const weekdagVan = (dag: string): number => new Date(Date.UTC(Number(dag.slice(0, 4)), Number(dag.slice(5, 7)) - 1, Number(dag.slice(8, 10)))).getUTCDay();

const beginVanDag = (dag: string): Date => amsterdamToUtc(Number(dag.slice(0, 4)), Number(dag.slice(5, 7)), Number(dag.slice(8, 10)));

/** Wordt de checklist op deze dag volgens de herhaling verwacht? */
export function verwachtOp(h: Herhaling, dag: string): boolean {
  if (h.soort === "geen") return false;
  if (h.soort === "dagelijks") return true;
  const wd = weekdagVan(dag);
  return h.soort === "werkdagen" ? wd >= 1 && wd <= 5 : h.dagen.includes(wd);
}

/**
 * Het tijdvenster van een verwachte dag: van 00:00 Nederlandse tijd tot (niet inbegrepen) de minuut na "uiterlijk", of
 * zonder uiterlijk tot het einde van de dag. Met `volgendeDag` loopt het venster door tot na middernacht. Een dag is
 * 23 of 25 uur bij de omschakeling, dus alles gaat via lib/time/amsterdam en nooit via "+ 24 uur".
 */
export function venster(h: Herhaling, dag: string): { van: Date; tot: Date } {
  const van = beginVanDag(dag);
  if (!h.uiterlijk) return { van, tot: beginVanDag(plusDagen(dag, 1)) };
  const eind = plusDagen(dag, h.volgendeDag ? 1 : 0);
  const [uur, min] = h.uiterlijk.split(":").map(Number);
  const klaar = amsterdamToUtc(Number(eind.slice(0, 4)), Number(eind.slice(5, 7)), Number(eind.slice(8, 10)), uur ?? 0, min ?? 0);
  return { van, tot: new Date(klaar.getTime() + 60_000) };
}

export type RijStatus = "compleet" | "gemist" | "open" | "nog-niet";

export interface OverzichtRij {
  dag: string;
  sjabloonId: string;
  sjabloonNaam: string;
  locatie: string;
  /** ISO met Z: het venster loopt van `vanIso` tot (niet inbegrepen) `totIso` */
  vanIso: string;
  totIso: string;
  /** compleet = alles gedaan; gemist = het venster is voorbij zonder complete uitvoering; open = het venster loopt; nog-niet = het begint nog */
  status: RijStatus;
  uitgevoerd: "compleet" | "gedeeltelijk" | "geen";
  uitvoeringId: string | null;
  /** wel compleet gedaan, maar na het venster van die dag */
  teLaat: boolean;
}

export interface Overzicht {
  dagen: string[];
  rijen: OverzichtRij[];
  gemist: OverzichtRij[];
}

/**
 * Per dag en per sjabloon: verwacht, uitgevoerd, gemist. `uitvoeringen` mogen ook uit de dag na `totDag` komen (een
 * venster na middernacht). Een uitvoering telt voor één dag: de vroegste verwachte dag waarvan het venster hem bevat
 * en die nog geen eigen uitvoering heeft (een complete gaat voor een gedeeltelijke). Voor de dag dat het sjabloon is
 * gemaakt, en vanaf het archiveren, wordt niets verwacht; een venster dat al voorbij was bij het maken telt ook niet.
 */
export function berekenOverzicht(sjablonen: Sjabloon[], uitvoeringen: Uitvoering[], vanDag: string, totDag: string, nu: Date): Overzicht {
  const dagen: string[] = [];
  for (let d = vanDag; d <= totDag && dagen.length < MAX_DAGEN; d = plusDagen(d, 1)) dagen.push(d);
  const rijen: OverzichtRij[] = [];
  const nuMs = nu.getTime();
  for (const s of sjablonen) {
    const eigen = uitvoeringen.filter((u) => u.sjabloonId === s.id).sort((a, b) => a.tijdstip.localeCompare(b.tijdstip));
    const gebruikt = new Set<string>();
    // ook de dagen vóór de periode meetellen kan de toewijzing veranderen: één dag eerder meenemen voor een venster na middernacht
    const reeks = [plusDagen(vanDag, -1), ...dagen];
    for (const dag of reeks) {
      if (!verwachtOp(s.herhaling, dag)) continue;
      const { van, tot } = venster(s.herhaling, dag);
      if (tot.getTime() <= new Date(s.gemaaktOp).getTime()) continue;
      if (s.gearchiveerdOp !== null && van.getTime() >= new Date(s.gearchiveerdOp).getTime()) continue;
      if (!s.actief && s.gearchiveerdOp === null) continue;
      const inVenster = eigen.filter((u) => !gebruikt.has(u.id) && new Date(u.tijdstip).getTime() >= van.getTime() && new Date(u.tijdstip).getTime() < tot.getTime());
      const gekozen = inVenster.find((u) => u.compleet) ?? inVenster[0] ?? null;
      if (gekozen) gebruikt.add(gekozen.id);
      if (dag < vanDag) continue; // alleen voor de toewijzing
      const uitgevoerd = gekozen ? (gekozen.compleet ? "compleet" : "gedeeltelijk") : "geen";
      const voorbij = nuMs >= tot.getTime();
      const status: RijStatus = uitgevoerd === "compleet" ? "compleet" : voorbij ? "gemist" : nuMs < van.getTime() ? "nog-niet" : "open";
      const teLaat = uitgevoerd !== "compleet" && eigen.some((u) => !gebruikt.has(u.id) && u.compleet && amsterdamDayKey(u.tijdstip) === dag && new Date(u.tijdstip).getTime() >= tot.getTime());
      rijen.push({ dag, sjabloonId: s.id, sjabloonNaam: s.naam, locatie: s.locatie, vanIso: van.toISOString(), totIso: tot.toISOString(), status, uitgevoerd, uitvoeringId: gekozen?.id ?? null, teLaat });
    }
  }
  rijen.sort((a, b) => a.dag.localeCompare(b.dag) || a.sjabloonNaam.localeCompare(b.sjabloonNaam, "nl"));
  return { dagen, rijen, gemist: rijen.filter((r) => r.status === "gemist").sort((a, b) => b.dag.localeCompare(a.dag) || a.sjabloonNaam.localeCompare(b.sjabloonNaam, "nl")) };
}

// --- persoonsgegevens ------------------------------------------------------------

/** Namen vergelijken zonder op hoofdletters of dubbele spaties te letten. */
export const zelfdeNaam = (a: string, b: string): boolean => schoneTekst(a, 200).toLocaleLowerCase("nl") === schoneTekst(b, 200).toLocaleLowerCase("nl") && schoneTekst(a, 200) !== "";

/** De uitvoeringen die ouder zijn dan de bewaartermijn (standaard 2 jaar): kandidaten om te wissen. Pure functie, geen opslag. */
export function verlopenUitvoeringen(uitvoeringen: Uitvoering[], nu: Date, jaren: number = BEWAAR_JAREN): Uitvoering[] {
  const grens = new Date(nu.getTime());
  grens.setUTCFullYear(grens.getUTCFullYear() - jaren);
  return uitvoeringen.filter((u) => new Date(u.tijdstip).getTime() < grens.getTime());
}
