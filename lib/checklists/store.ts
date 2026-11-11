// ---------------------------------------------------------------------------
// Opslag van checklists, in de KV-opslag per organisatie (geen migratie nodig):
//   checklist:sjabloon:<tenantId>:<id>            een sjabloon (taken, herhaling, hash van de invullink)
//   checklist:uitv:<tenantId>:<dag>~<id>          één uitvoering; de dag staat in de sleutel, een dag is zo in één keer op te halen
//   checklist:link:<hash>                         welke organisatie en welk sjabloon bij een invullink hoort
// De sleutel van een invullink (in het adres /checklist/<sleutel>) staat nergens: alleen een hash (zoals bij de
// terminals van lib/incheck). Een uitvoering is onveranderlijk; het enige dat later nog verandert is de naam van de
// uitvoerder, bij een verzoek om gegevens te wissen (wisUitvoerder).
// ---------------------------------------------------------------------------

import { createHmac, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import {
  AANVRAAG_ID,
  DAG_SLEUTEL,
  MAX_SJABLONEN,
  SJABLOON_ID,
  UITVOERING_ID,
  berekenOverzicht,
  plusDagen,
  zelfdeNaam,
  type Overzicht,
  type Sjabloon,
  type SjabloonInvoer,
  type Uitvoering,
  type UitvoeringInvoer,
} from "@/lib/checklists/model";

const MAX_UITVOERINGEN = 20_000;
export const LINK_SLEUTEL = /^[A-Za-z0-9_-]{32}$/;

const voorvoegselSjablonen = (t: string) => `checklist:sjabloon:${t}:`;
const sleutelSjabloon = (t: string, id: string) => `${voorvoegselSjablonen(t)}${id}`;
const voorvoegselUitv = (t: string) => `checklist:uitv:${t}:`;
const sleutelUitv = (t: string, id: string) => `${voorvoegselUitv(t)}${id}`;
const sleutelLink = (hash: string) => `checklist:link:${hash}`;

interface LinkVerwijzing {
  tenantId: string;
  sjabloonId: string;
  bedrijfsnaam: string;
}

/** Een nieuwe sleutel voor een invullink: niet te raden, nooit loggen. */
export const nieuweLinkSleutel = (): string => randomBytes(24).toString("base64url");

/** De sleutel wordt alleen als hash bewaard. */
export const linkHash = (sleutel: string): string => createHmac("sha256", process.env.AUTH_SECRET ?? "dev-secret").update(`checklist-sleutel:${sleutel}`).digest("base64url").slice(0, 32);

/** Een kort willekeurig id voor een taak. */
export const nieuwTaakId = (): string => randomBytes(4).toString("hex");

// --- sjablonen ---------------------------------------------------------------

export async function sjablonenVan(tenantId: string): Promise<Sjabloon[]> {
  const lijst = await kvListValues<Sjabloon>(voorvoegselSjablonen(tenantId), 200);
  return lijst.sort((a, b) => Number(b.actief) - Number(a.actief) || a.naam.localeCompare(b.naam, "nl"));
}

export async function leesSjabloon(tenantId: string, id: string): Promise<Sjabloon | null> {
  return SJABLOON_ID.test(id) ? kvGet<Sjabloon>(sleutelSjabloon(tenantId, id)) : null;
}

export async function maakSjabloon(tenantId: string, i: SjabloonInvoer, nu: Date = new Date()): Promise<Sjabloon> {
  if ((await sjablonenVan(tenantId)).length >= MAX_SJABLONEN) throw AppError.validation(`Je kunt hoogstens ${MAX_SJABLONEN} checklists hebben. Archiveer er een paar.`);
  const s: Sjabloon = { id: randomBytes(5).toString("hex"), ...i, gemaaktOp: nu.toISOString(), gearchiveerdOp: i.actief ? null : nu.toISOString(), linkHash: null };
  await kvSet(sleutelSjabloon(tenantId, s.id), s);
  return s;
}

/** Een sjabloon aanpassen. Archiveren legt het moment vast (vanaf dan wordt er niets meer verwacht); weer actief maken haalt het weg. */
export async function wijzigSjabloon(tenantId: string, id: string, i: SjabloonInvoer, nu: Date = new Date()): Promise<Sjabloon> {
  const oud = await leesSjabloon(tenantId, id);
  if (!oud) throw AppError.notFound("Deze checklist bestaat niet (meer).");
  const gearchiveerdOp = i.actief ? null : (oud.gearchiveerdOp ?? nu.toISOString());
  const nieuw: Sjabloon = { ...oud, ...i, gearchiveerdOp };
  await kvSet(sleutelSjabloon(tenantId, id), nieuw);
  return nieuw;
}

// --- invullink ---------------------------------------------------------------

/** Een nieuwe invullink voor een sjabloon; een eerdere link werkt daarna niet meer. De sleutel zie je alleen nu. */
export async function maakLink(tenantId: string, id: string, bedrijfsnaam: string): Promise<{ sjabloon: Sjabloon; sleutel: string }> {
  const s = await leesSjabloon(tenantId, id);
  if (!s) throw AppError.notFound("Deze checklist bestaat niet (meer).");
  const sleutel = nieuweLinkSleutel();
  const hash = linkHash(sleutel);
  if (s.linkHash) await kvDelete(sleutelLink(s.linkHash));
  await kvSet(sleutelLink(hash), { tenantId, sjabloonId: id, bedrijfsnaam } satisfies LinkVerwijzing);
  const nieuw: Sjabloon = { ...s, linkHash: hash };
  await kvSet(sleutelSjabloon(tenantId, id), nieuw);
  return { sjabloon: nieuw, sleutel };
}

export async function trekLinkIn(tenantId: string, id: string): Promise<Sjabloon> {
  const s = await leesSjabloon(tenantId, id);
  if (!s) throw AppError.notFound("Deze checklist bestaat niet (meer).");
  if (s.linkHash) await kvDelete(sleutelLink(s.linkHash));
  const nieuw: Sjabloon = { ...s, linkHash: null };
  await kvSet(sleutelSjabloon(tenantId, id), nieuw);
  return nieuw;
}

/** Het sjabloon achter een invulsleutel; null als de sleutel niet klopt, is ingetrokken of het sjabloon gearchiveerd is. */
export async function sjabloonVanSleutel(sleutel: string): Promise<{ tenantId: string; sjabloon: Sjabloon; bedrijfsnaam: string } | null> {
  if (!LINK_SLEUTEL.test(sleutel)) return null;
  const hash = linkHash(sleutel);
  const v = await kvGet<LinkVerwijzing>(sleutelLink(hash));
  if (!v) return null;
  const sjabloon = await leesSjabloon(v.tenantId, v.sjabloonId);
  return sjabloon && sjabloon.actief && sjabloon.linkHash === hash ? { tenantId: v.tenantId, sjabloon, bedrijfsnaam: v.bedrijfsnaam } : null;
}

// --- uitvoeringen ------------------------------------------------------------

export async function uitvoeringenVanDag(tenantId: string, dag: string): Promise<Uitvoering[]> {
  if (!DAG_SLEUTEL.test(dag)) return [];
  const lijst = await kvListValues<Uitvoering>(`${voorvoegselUitv(tenantId)}${dag}~`, 500);
  return lijst.sort((a, b) => a.tijdstip.localeCompare(b.tijdstip));
}

/** Alle uitvoeringen tussen twee dagen (allebei inbegrepen), op tijd. */
export async function uitvoeringenTussen(tenantId: string, vanDag: string, totDag: string): Promise<Uitvoering[]> {
  if (!DAG_SLEUTEL.test(vanDag) || !DAG_SLEUTEL.test(totDag) || totDag < vanDag) return [];
  const dagen: string[] = [];
  for (let d = vanDag; d <= totDag && dagen.length < 70; d = plusDagen(d, 1)) dagen.push(d);
  const per = await Promise.all(dagen.map((d) => uitvoeringenVanDag(tenantId, d)));
  return per.flat();
}

export async function leesUitvoering(tenantId: string, id: string): Promise<Uitvoering | null> {
  return UITVOERING_ID.test(id) ? kvGet<Uitvoering>(sleutelUitv(tenantId, id)) : null;
}

export interface LegVast {
  bron: "link" | "beheer";
  correctieVan?: string | undefined;
  aanvraagId?: string | undefined;
}

/**
 * Een uitvoering vastleggen, op de servertijd. Komt dezelfde `aanvraagId` nog eens binnen (een dubbele tik, of een
 * nieuwe poging op een trage verbinding), dan krijg je de eerste uitvoering terug en wordt er geen tweede gemaakt.
 */
export async function leggVast(tenantId: string, s: Sjabloon, i: UitvoeringInvoer, opties: LegVast, nu: Date = new Date()): Promise<{ uitvoering: Uitvoering; dubbel: boolean }> {
  if (opties.aanvraagId !== undefined) {
    if (!AANVRAAG_ID.test(opties.aanvraagId)) throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    const eerder = [...(await uitvoeringenVanDag(tenantId, amsterdamDayKey(nu))), ...(await uitvoeringenVanDag(tenantId, amsterdamDayKey(new Date(nu.getTime() - 86_400_000))))].find((u) => u.aanvraagId === opties.aanvraagId && u.sjabloonId === s.id);
    if (eerder) return { uitvoering: eerder, dubbel: true };
  }
  if (opties.correctieVan !== undefined) {
    const oud = await leesUitvoering(tenantId, opties.correctieVan);
    if (!oud || oud.sjabloonId !== s.id) throw AppError.notFound("De uitvoering die je wilt corrigeren bestaat niet.");
  }
  const uitvoering: Uitvoering = {
    id: `${amsterdamDayKey(nu)}~${randomBytes(6).toString("hex")}`,
    sjabloonId: s.id,
    sjabloonNaam: s.naam,
    locatie: s.locatie,
    uitvoerder: i.uitvoerder,
    tijdstip: nu.toISOString(),
    taken: i.taken,
    notitie: i.notitie,
    compleet: i.compleet,
    correctieVan: opties.correctieVan ?? null,
    bron: opties.bron,
    ...(opties.aanvraagId !== undefined ? { aanvraagId: opties.aanvraagId } : {}),
  };
  await kvSet(sleutelUitv(tenantId, uitvoering.id), uitvoering);
  return { uitvoering, dubbel: false };
}

/**
 * Het overzicht van een periode (hooguit 31 dagen): verwacht, gedaan, gemist, met de uitvoeringen erachter. Eén dag
 * extra wordt opgehaald: een venster na middernacht kan een uitvoering van de dag erna bevatten.
 */
export async function maakOverzicht(tenantId: string, vanDag: string, totDag: string, nu: Date = new Date()): Promise<{ overzicht: Overzicht; sjablonen: Sjabloon[]; uitvoeringen: Uitvoering[] }> {
  const [sjablonen, uitvoeringen] = await Promise.all([sjablonenVan(tenantId), uitvoeringenTussen(tenantId, vanDag, plusDagen(totDag, 1))]);
  return { overzicht: berekenOverzicht(sjablonen, uitvoeringen, vanDag, totDag, nu), sjablonen, uitvoeringen };
}

// --- persoonsgegevens --------------------------------------------------------

/** Alle uitvoeringen van een organisatie (voor wissen en de bewaartermijn). */
export async function alleUitvoeringen(tenantId: string): Promise<Uitvoering[]> {
  return kvListValues<Uitvoering>(voorvoegselUitv(tenantId), MAX_UITVOERINGEN);
}

/**
 * De naam van een uitvoerder wissen (recht op vergetelheid): in alle uitvoeringen waar hij staat wordt de naam
 * "Verwijderd". De uitvoeringen zelf blijven bestaan (taken, tijd, compleet), zodat het overzicht van het bedrijf klopt.
 * Vrije tekst in een notitie of opmerking blijft staan: die kan een bedrijf zelf nalezen.
 */
export async function wisUitvoerder(tenantId: string, naam: string): Promise<number> {
  const alle = await kvListEntries<Uitvoering>(voorvoegselUitv(tenantId), MAX_UITVOERINGEN);
  let aantal = 0;
  for (const e of alle) {
    if (!zelfdeNaam(e.value.uitvoerder, naam)) continue;
    await kvSet(e.key, { ...e.value, uitvoerder: "Verwijderd" } satisfies Uitvoering);
    aantal += 1;
  }
  return aantal;
}

/** De namen die in de uitvoeringen staan, met hoe vaak: om de juiste persoon te kiezen bij wissen. */
export async function uitvoerderNamen(tenantId: string): Promise<{ naam: string; aantal: number }[]> {
  const tel = new Map<string, { naam: string; aantal: number }>();
  for (const u of await alleUitvoeringen(tenantId)) {
    if (u.uitvoerder === "Verwijderd") continue;
    const k = u.uitvoerder.toLocaleLowerCase("nl");
    const e = tel.get(k);
    if (e) e.aantal += 1;
    else tel.set(k, { naam: u.uitvoerder, aantal: 1 });
  }
  return [...tel.values()].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}
