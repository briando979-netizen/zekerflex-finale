// ---------------------------------------------------------------------------
// Nachtelijke boekhoudronde: de kern (puur, zonder prisma, kv of mail; alles komt via `RondeAfhankelijkheden`).
// Per echte administratie achtereen: nieuwe facturen boeken, bankregels koppelen (alleen wat de bestaande matching
// zeker weet; twijfel blijft "even kijken") en het btw-concept opnieuw rekenen als er boekingen bij zijn gekomen.
// Daarna de deadlinemeldingen (14, 7 en 2 dagen vooraf, elk één keer) en één herinnering als er "even kijken"-items
// te lang liggen. Het systeem DIENT NOOIT BTW IN: het concept blijft een concept. Een stap die faalt stopt de rest niet.
// In uitslag en logboek staan alleen aantallen en vaste teksten, nooit namen, IBAN's of bedragen van klanten.
// ---------------------------------------------------------------------------

import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import type { Deadline } from "./deadlines";
import { btwDeadlineDag } from "./btw/kern";

export const NACHTRONDE_FLAG = "boekhouding-nachtronde";
export const NACHTRONDE_JOB = "boekhouding-nachtronde";
export const KV_NACHTRONDE = "boekronde:laatste";
export const KV_EVEN_KIJKEN = "boekronde:evenkijken-laatste";
/** Zoveel dagen vóór een deadline komt er een melding (elk één keer). */
export const DREMPELS_DAGEN: readonly number[] = [14, 7, 2];
/** Een "even kijken"-item dat zo lang ligt, telt mee voor de herinnering. */
export const EVEN_KIJKEN_NA_DAGEN = 3;
/** Hoogstens zo vaak een herinnering over "even kijken". */
export const EVEN_KIJKEN_HERINNERING_DAGEN = 7;
/** Facturen van de laatste N dagen worden nagelopen (boekOpenFacturen pakt altijd de oudste eerst; oudere zijn al geboekt). */
export const FACTUREN_TERUGBLIK_DAGEN = 60;

export type StapNaam = "administraties" | "facturen" | "bank" | "btw" | "deadlines" | "even-kijken";

export interface StapUitslag {
  stap: StapNaam;
  ok: boolean;
  /** korte, vaste tekst met aantallen */
  samenvatting: string;
}

export interface AdministratieUitslag {
  administratieId: string;
  stappen: StapUitslag[];
}

export interface NachtrondeUitslag {
  at: string;
  ms: number;
  administraties: AdministratieUitslag[];
  /** stappen die niet bij één administratie horen (deadlines, herinnering) */
  algemeen: StapUitslag[];
  /** aantal stappen dat misging */
  fouten: number;
}

export type RondeUitkomst = { status: "uit" } | { status: "gedraaid"; uitslag: NachtrondeUitslag };

export interface BtwToestand {
  status: "BEREKEND" | "GOEDGEKEURD" | "INGEDIEND" | "VERVANGEN";
  berekendOp: Date;
}

export interface BoekingenStempel {
  aantal: number;
  /** wanneer de laatste boeking in dit kwartaal is aangemaakt */
  laatsteAanmaak: Date | null;
}

export interface MeldingInvoer {
  key: string;
  title: string;
  detail: string;
  severity: "critical" | "warning";
  url: string;
}

export interface RondeAfhankelijkheden {
  flagAan: () => Promise<boolean>;
  /** echte, actieve administraties (id's) */
  administraties: () => Promise<string[]>;
  boekFacturen: (administratieId: string, sinds: Date, nu: Date) => Promise<{ nieuw: number; alGeboekt: number; fouten: number }>;
  verwerkBank: (administratieId: string) => Promise<{ bekeken: number; geboekt: number; gekoppeld: number; evenKijken: number; mislukt: number }>;
  boekingenStempel: (administratieId: string, jaar: number, kwartaal: number) => Promise<BoekingenStempel>;
  /** null = er is nog geen concept voor dit kwartaal */
  btwToestand: (administratieId: string, jaar: number, kwartaal: number) => Promise<BtwToestand | null>;
  maakBtwConcept: (administratieId: string, jaar: number, kwartaal: number, nu: Date) => Promise<void>;
  /** aantal items in "even kijken" (bank en bonnen) dat al sinds vóór `grens` ligt */
  telEvenKijken: (administratieId: string, grens: Date) => Promise<number>;
  deadlines: (nu: Date) => Deadline[];
  /** is deze melding (sleutel) al verstuurd? */
  meldingVerstuurd: (sleutel: string) => Promise<boolean>;
  markeerVerstuurd: (sleutel: string, nu: Date) => Promise<void>;
  stuurMelding: (m: MeldingInvoer) => Promise<"sent" | "deduped" | "failed">;
  /** de Amsterdamse dag waarop de laatste "even kijken"-herinnering ging, of null */
  laatsteEvenKijkenHerinnering: () => Promise<string | null>;
  bewaarUitslag: (u: NachtrondeUitslag) => Promise<void>;
  /** schrijft naar het foutenlogboek; nooit met namen of inhoud */
  meldFout: (stap: StapNaam, e: unknown, administratieId?: string) => void;
}

// ---- kleine pure hulpjes ---------------------------------------------------

/** Aantal hele Amsterdamse kalenderdagen van `nu` tot `doel` (0 = dezelfde dag). */
export function dagenTot(nu: Date, doel: Date): number {
  return dagVerschil(amsterdamDayKey(nu), amsterdamDayKey(doel));
}

/** Hele dagen van dagsleutel `van` tot `tot` (beide "JJJJ-MM-DD"). */
export function dagVerschil(van: string, tot: string): number {
  const dag = (k: string): number => {
    const [j, m, d] = k.split("-").map(Number);
    return Date.UTC(j ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((dag(tot) - dag(van)) / 86_400_000);
}

/** Het lopende kwartaal en, zolang de aangifte nog open ligt, het vorige. */
export function kwartalenVoorConcept(nu: Date): { jaar: number; kwartaal: number }[] {
  const { year, month } = amsterdamParts(nu);
  const huidig = { jaar: year, kwartaal: Math.ceil(month / 3) };
  const vorig = huidig.kwartaal === 1 ? { jaar: year - 1, kwartaal: 4 } : { jaar: year, kwartaal: huidig.kwartaal - 1 };
  const deadline = btwDeadlineDag(vorig.jaar, vorig.kwartaal);
  const vandaag = amsterdamDayKey(nu);
  return deadline !== null && vandaag <= deadline ? [vorig, huidig] : [huidig];
}

/**
 * Welke drempel er nu bij hoort. `bereikt` = alle drempels die al zijn gepasseerd (dagen over <= drempel). Stuur alleen
 * de strakste (kleinste), en alleen als die nog niet is verstuurd; de grovere gelden dan ook als gedaan, zodat een
 * taak die een paar dagen stil lag niet alsnog "14 dagen" meldt vlak voor de deadline.
 */
export function drempelBesluit(dagenOver: number, alVerstuurd: ReadonlySet<number>): { stuur: number | null; markeer: number[] } {
  const bereikt = DREMPELS_DAGEN.filter((t) => dagenOver <= t);
  if (bereikt.length === 0) return { stuur: null, markeer: [] };
  const strakste = Math.min(...bereikt);
  return { stuur: alVerstuurd.has(strakste) ? null : strakste, markeer: [...bereikt] };
}

export const drempelSleutel = (deadlineSleutel: string, drempel: number): string => `boekronde:deadline:${deadlineSleutel}:${drempel}`;

function wanneerTekst(dagen: number): string {
  if (dagen <= 0) return "vandaag";
  if (dagen === 1) return "morgen";
  return `over ${dagen} dagen`;
}

export function datumNl(d: Date): string {
  return d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });
}

export function deadlineMelding(d: Deadline, dagen: number, drempel: number): MeldingInvoer {
  const extra = d.sleutel.startsWith("btw-") ? " Een ICP-opgave valt op dezelfde dag, als die voor jullie geldt." : "";
  return {
    key: `boekronde-deadline:${d.sleutel}:${drempel}`,
    title: `Deadline ${wanneerTekst(dagen)}: ${d.titel}`,
    detail: `${d.titel}: uiterlijk ${datumNl(d.datum)}. ${d.wat}${extra} ZekerFlex dient zelf niets in. ${d.waarschuwing ?? ""} ${d.bevestigDoor}`.replace(/\s+/g, " ").trim(),
    severity: drempel <= 2 ? "critical" : "warning",
    url: "/admin/boekhouding",
  };
}

const tekstAantal = (n: number, een: string, meer: string): string => `${n} ${n === 1 ? een : meer}`;

// ---- de stappen ------------------------------------------------------------

async function stap(
  d: RondeAfhankelijkheden,
  naam: StapNaam,
  administratieId: string | undefined,
  werk: () => Promise<string>,
): Promise<StapUitslag> {
  try {
    return { stap: naam, ok: true, samenvatting: await werk() };
  } catch (e) {
    try {
      d.meldFout(naam, e, administratieId);
    } catch {
      /* een kapotte logger mag de ronde niet stoppen */
    }
    return { stap: naam, ok: false, samenvatting: "Mislukt; de fout staat in het foutenlogboek." };
  }
}

async function conceptStap(d: RondeAfhankelijkheden, id: string, nu: Date): Promise<string> {
  let nieuw = 0;
  let wachtOpMens = 0;
  for (const { jaar, kwartaal } of kwartalenVoorConcept(nu)) {
    const stempel = await d.boekingenStempel(id, jaar, kwartaal);
    if (stempel.aantal === 0 || !stempel.laatsteAanmaak) continue;
    const toestand = await d.btwToestand(id, jaar, kwartaal);
    const veranderd = !toestand || stempel.laatsteAanmaak.getTime() > toestand.berekendOp.getTime();
    if (!veranderd) continue;
    // Wat een mens heeft goedgekeurd of ingediend raken we nooit aan: een nieuw concept zou de goedkeuring vervangen.
    if (toestand && toestand.status !== "BEREKEND") {
      wachtOpMens += 1;
      continue;
    }
    await d.maakBtwConcept(id, jaar, kwartaal, nu);
    nieuw += 1;
  }
  const mens = wachtOpMens > 0 ? ` ${tekstAantal(wachtOpMens, "kwartaal is", "kwartalen zijn")} na goedkeuring gewijzigd: kijk zelf of een nieuw concept nodig is.` : "";
  return `${tekstAantal(nieuw, "btw-concept", "btw-concepten")} opnieuw berekend.${mens}`;
}

async function perAdministratie(d: RondeAfhankelijkheden, id: string, nu: Date): Promise<AdministratieUitslag> {
  const sinds = new Date(nu.getTime() - FACTUREN_TERUGBLIK_DAGEN * 86_400_000);
  const stappen: StapUitslag[] = [];
  stappen.push(
    await stap(d, "facturen", id, async () => {
      const r = await d.boekFacturen(id, sinds, nu);
      return `${tekstAantal(r.nieuw, "factuur", "facturen")} geboekt, ${r.alGeboekt} stond er al, ${tekstAantal(r.fouten, "melding", "meldingen")} om na te kijken.`;
    }),
  );
  stappen.push(
    await stap(d, "bank", id, async () => {
      const r = await d.verwerkBank(id);
      return `${r.bekeken} banktransacties bekeken: ${r.geboekt} geboekt, ${r.gekoppeld} gekoppeld, ${r.evenKijken} even kijken, ${r.mislukt} niet gelukt.`;
    }),
  );
  stappen.push(await stap(d, "btw", id, () => conceptStap(d, id, nu)));
  return { administratieId: id, stappen };
}

async function deadlineStap(d: RondeAfhankelijkheden, nu: Date): Promise<string> {
  let verstuurd = 0;
  let mislukt = 0;
  for (const dl of d.deadlines(nu)) {
    // De ICP-opgave valt op dezelfde dag als de btw-aangifte en staat al in die melding.
    if (dl.sleutel.startsWith("icp-")) continue;
    const dagen = dagenTot(nu, dl.datum);
    const al = new Set<number>();
    for (const t of DREMPELS_DAGEN) if (await d.meldingVerstuurd(drempelSleutel(dl.sleutel, t))) al.add(t);
    const besluit = drempelBesluit(dagen, al);
    if (besluit.stuur !== null) {
      const uitkomst = await d.stuurMelding(deadlineMelding(dl, dagen, besluit.stuur));
      if (uitkomst === "failed") {
        mislukt += 1;
        continue;
      }
      if (uitkomst === "sent") verstuurd += 1;
    }
    for (const t of besluit.markeer) if (!al.has(t)) await d.markeerVerstuurd(drempelSleutel(dl.sleutel, t), nu);
  }
  if (mislukt > 0) throw new Error(`${mislukt} deadlinemeldingen niet verstuurd`);
  return `${tekstAantal(verstuurd, "deadlinemelding", "deadlinemeldingen")} verstuurd.`;
}

async function evenKijkenStap(d: RondeAfhankelijkheden, ids: readonly string[], nu: Date): Promise<string> {
  const grens = new Date(nu.getTime() - EVEN_KIJKEN_NA_DAGEN * 86_400_000);
  let totaal = 0;
  for (const id of ids) totaal += await d.telEvenKijken(id, grens);
  if (totaal === 0) return "Niets ligt langer dan drie dagen bij even kijken.";
  const vandaag = amsterdamDayKey(nu);
  const laatste = await d.laatsteEvenKijkenHerinnering();
  if (laatste && dagVerschil(laatste, vandaag) <EVEN_KIJKEN_HERINNERING_DAGEN) {
    return `${totaal} items liggen bij even kijken; de herinnering ging op ${laatste} al.`;
  }
  const uitkomst = await d.stuurMelding({
    key: `boekronde-evenkijken:${vandaag}`,
    title: "Boekhouding: er ligt werk bij even kijken",
    detail: `${tekstAantal(totaal, "item ligt", "items liggen")} al langer dan ${EVEN_KIJKEN_NA_DAGEN} dagen bij even kijken (bank en bonnen). Open Beheer, Boekhouding en kijk ze na.`,
    severity: "warning",
    url: "/admin/boekhouding",
  });
  if (uitkomst === "failed") throw new Error("herinnering niet verstuurd");
  await d.markeerVerstuurd(KV_EVEN_KIJKEN, nu);
  return `${tekstAantal(totaal, "item ligt", "items liggen")} te lang bij even kijken; herinnering ${uitkomst === "sent" ? "verstuurd" : "was er al"}.`;
}

/**
 * De hele ronde. Met de vlag uit gebeurt er niets. `nu` is een parameter zodat tests de klok bevriezen.
 * Elke stap vangt zijn eigen fout op; de uitslag telt de mislukte stappen.
 */
export async function draaiNachtronde(d: RondeAfhankelijkheden, nu: Date = new Date()): Promise<RondeUitkomst> {
  if (!(await d.flagAan())) return { status: "uit" };
  const start = Date.now();
  const algemeen: StapUitslag[] = [];
  const administraties: AdministratieUitslag[] = [];

  let ids: string[] = [];
  const lijst = await stap(d, "administraties", undefined, async () => {
    ids = await d.administraties();
    return `${tekstAantal(ids.length, "echte administratie", "echte administraties")}.`;
  });
  algemeen.push(lijst);

  for (const id of ids) administraties.push(await perAdministratie(d, id, nu));

  algemeen.push(await stap(d, "deadlines", undefined, () => deadlineStap(d, nu)));
  algemeen.push(await stap(d, "even-kijken", undefined, () => evenKijkenStap(d, ids, nu)));

  const alle = [...algemeen, ...administraties.flatMap((a) => a.stappen)];
  const uitslag: NachtrondeUitslag = {
    at: nu.toISOString(),
    ms: Date.now() - start,
    administraties,
    algemeen,
    fouten: alle.filter((s) => !s.ok).length,
  };
  try {
    await d.bewaarUitslag(uitslag);
  } catch {
    /* de uitslag is een extraatje voor het scherm; de ronde zelf is gedaan */
  }
  return { status: "gedraaid", uitslag };
}
