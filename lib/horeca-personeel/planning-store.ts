import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";
import {
  MAX_DIENSTEN,
  MAX_NIET_BESCHIKBAAR,
  MAX_RUILEN,
  MAX_UREN,
  MAX_VERLOF,
  RUIL_STATUSSEN,
  VERLOF_STATUSSEN,
  dagenTussen,
  isDatum,
  isTijd,
  legePlanning,
  plusDagen,
  verdeelFooi,
  waarschuwingen,
  MAX_FOOIEN,
  type Dienst,
  type PlanWaarschuwing,
  type Planning,
  type Ruil,
  type Uur,
  type Verlof,
} from "@/lib/horeca-personeel/planning";

// ---------------------------------------------------------------------------
// Het bewaren van de planning (lib/horeca-personeel/planning.ts): één KV-waarde per bedrijf (horeca:planning:<tenantId>,
// lib/privacy/org-kv.ts). Elke wijziging leest de hele waarde, past hem aan en zet hem terug; de aantallen zijn klein (een
// team) en de oudste regels vallen af als een lijst vol is. Wie iets mag, bepaalt de aanroeper (de API-routes): de functies
// hieronder voor een medewerker krijgen zijn eigen id uit zijn sessie en raken nooit de regels van een collega.
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(40);
const datum = z.string().refine(isDatum);
const tijd = z.string().refine(isTijd);
const tekst = z.string().max(300);

const planningSchema = z.object({
  versie: z.literal(1),
  diensten: z.array(z.object({ id, medewerkerId: id.nullable(), datum, van: tijd, tot: tijd, notitie: tekst })).max(MAX_DIENSTEN),
  nietBeschikbaar: z.array(z.object({ id, medewerkerId: id, datum, notitie: tekst })).max(MAX_NIET_BESCHIKBAAR),
  ruilen: z.array(z.object({ id, dienstId: id, van: id.nullable(), naar: id.nullable(), status: z.enum(RUIL_STATUSSEN), op: z.string().max(40) })).max(MAX_RUILEN),
  verlof: z.array(z.object({ id, medewerkerId: id, van: datum, tot: datum, reden: tekst, status: z.enum(VERLOF_STATUSSEN), op: z.string().max(40) })).max(MAX_VERLOF),
  uren: z.array(z.object({ id, medewerkerId: id, datum, in: tijd, uit: tijd.nullable(), bron: z.enum(["klok", "beheer"]) })).max(MAX_UREN),
  fooien: z
    .array(z.object({ id, van: datum, tot: datum, totaalCent: z.number().int().min(1).max(100_000_000), verdeling: z.array(z.object({ medewerkerId: id, cent: z.number().int().min(0) })).max(200), notitie: tekst, op: z.string().max(40) }))
    .max(MAX_FOOIEN)
    .default([]),
});

export async function leesPlanningVan(tenantId: string): Promise<Planning> {
  const ruw = await kvGet<unknown>(`horeca:planning:${tenantId}`);
  const r = ruw === null ? null : planningSchema.safeParse(ruw);
  return r && r.success ? r.data : legePlanning();
}

/** Lees, pas aan, kap de lijsten af op hun grens (de oudste vallen weg) en zet terug. */
async function wijzig<T>(tenantId: string, doe: (p: Planning) => T): Promise<{ planning: Planning; uit: T }> {
  const p = await leesPlanningVan(tenantId);
  const uit = doe(p);
  p.diensten = p.diensten.slice(-MAX_DIENSTEN);
  p.nietBeschikbaar = p.nietBeschikbaar.slice(-MAX_NIET_BESCHIKBAAR);
  p.ruilen = p.ruilen.slice(-MAX_RUILEN);
  p.verlof = p.verlof.slice(-MAX_VERLOF);
  p.uren = p.uren.slice(-MAX_UREN);
  await kvSet(`horeca:planning:${tenantId}`, p);
  return { planning: p, uit };
}

const nieuwId = (): string => randomUUID().slice(0, 10);

/** Is dit een medewerker met een actief account van deze zaak? */
async function eisActief(tenantId: string, medewerkerId: string): Promise<void> {
  const d = await leesPersoneelVan(tenantId);
  if (!d.medewerkers.some((m) => m.id === medewerkerId && m.status === "actief")) throw AppError.notFound("Deze medewerker is niet (meer) actief.");
}

function eisDienstInvoer(i: { datum: string; van: string; tot: string }): void {
  if (!isDatum(i.datum)) throw AppError.validation("Kies een geldige datum.");
  if (!isTijd(i.van) || !isTijd(i.tot)) throw AppError.validation("Vul de begin- en eindtijd in als uu:mm.");
  if (i.van === i.tot) throw AppError.validation("Begin- en eindtijd mogen niet gelijk zijn.");
}

// ---- rooster (beheerder) ---------------------------------------------------

export async function plaatsDienst(
  tenantId: string,
  i: { medewerkerId: string | null; datum: string; van: string; tot: string; notitie: string },
): Promise<{ planning: Planning; dienst: Dienst; waarschuwingen: PlanWaarschuwing[] }> {
  eisDienstInvoer(i);
  if (i.medewerkerId) await eisActief(tenantId, i.medewerkerId);
  const { planning, uit } = await wijzig(tenantId, (p) => {
    const dienst: Dienst = { id: nieuwId(), medewerkerId: i.medewerkerId, datum: i.datum, van: i.van, tot: i.tot, notitie: i.notitie.trim().slice(0, 300) };
    const w = waarschuwingen(p, dienst);
    p.diensten.push(dienst);
    return { dienst, w };
  });
  return { planning, dienst: uit.dienst, waarschuwingen: uit.w };
}

export async function wijzigDienst(
  tenantId: string,
  dienstId: string,
  i: { medewerkerId?: string | null | undefined; datum?: string | undefined; van?: string | undefined; tot?: string | undefined; notitie?: string | undefined },
): Promise<{ planning: Planning; waarschuwingen: PlanWaarschuwing[] }> {
  if (i.medewerkerId) await eisActief(tenantId, i.medewerkerId);
  const { planning, uit } = await wijzig(tenantId, (p) => {
    const d = p.diensten.find((x) => x.id === dienstId);
    if (!d) throw AppError.notFound("Deze dienst bestaat niet meer.");
    const nieuw: Dienst = {
      ...d,
      ...(i.medewerkerId !== undefined ? { medewerkerId: i.medewerkerId } : {}),
      ...(i.datum !== undefined ? { datum: i.datum } : {}),
      ...(i.van !== undefined ? { van: i.van } : {}),
      ...(i.tot !== undefined ? { tot: i.tot } : {}),
      ...(i.notitie !== undefined ? { notitie: i.notitie.trim().slice(0, 300) } : {}),
    };
    eisDienstInvoer(nieuw);
    const w = waarschuwingen(p, nieuw);
    p.diensten = p.diensten.map((x) => (x.id === dienstId ? nieuw : x));
    // een lopend ruilverzoek voor een dienst die van eigenaar verandert, vervalt
    if (nieuw.medewerkerId !== d.medewerkerId) p.ruilen = p.ruilen.map((r) => (r.dienstId === dienstId && (r.status === "aangeboden" || r.status === "geaccepteerd") ? { ...r, status: "ingetrokken" } : r));
    return w;
  });
  return { planning, waarschuwingen: uit };
}

export async function verwijderDienst(tenantId: string, dienstId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.diensten = p.diensten.filter((x) => x.id !== dienstId);
    p.ruilen = p.ruilen.map((r) => (r.dienstId === dienstId && (r.status === "aangeboden" || r.status === "geaccepteerd") ? { ...r, status: "ingetrokken" } : r));
  });
  return planning;
}

/** De diensten van de ene week naar een andere week kopiëren (dezelfde dag van de week, dezelfde mensen). */
export async function kopieerWeek(tenantId: string, vanStart: string, naarStart: string): Promise<{ planning: Planning; aantal: number }> {
  if (!isDatum(vanStart) || !isDatum(naarStart)) throw AppError.validation("Kies geldige weken.");
  if (vanStart === naarStart) throw AppError.validation("Kies een andere week om naartoe te kopiëren.");
  const verschil = dagenTussen(vanStart, naarStart);
  const { planning, uit } = await wijzig(tenantId, (p) => {
    const bron = p.diensten.filter((d) => d.datum >= vanStart && d.datum <= plusDagen(vanStart, 6));
    let n = 0;
    for (const d of bron) {
      const nieuw: Dienst = { ...d, id: nieuwId(), datum: plusDagen(d.datum, verschil) };
      // niet dubbel: een identieke dienst voor dezelfde persoon op dat tijdstip bestaat al
      if (p.diensten.some((x) => x.medewerkerId === nieuw.medewerkerId && x.datum === nieuw.datum && x.van === nieuw.van && x.tot === nieuw.tot)) continue;
      p.diensten.push(nieuw);
      n += 1;
    }
    return n;
  });
  return { planning, aantal: uit };
}

// ---- niet beschikbaar (medewerker) ----------------------------------------

export async function meldNietBeschikbaar(tenantId: string, medewerkerId: string, i: { datum: string; notitie: string }): Promise<Planning> {
  if (!isDatum(i.datum)) throw AppError.validation("Kies een geldige datum.");
  const { planning } = await wijzig(tenantId, (p) => {
    if (p.nietBeschikbaar.some((n) => n.medewerkerId === medewerkerId && n.datum === i.datum)) return;
    p.nietBeschikbaar.push({ id: nieuwId(), medewerkerId, datum: i.datum, notitie: i.notitie.trim().slice(0, 300) });
  });
  return planning;
}

export async function verwijderNietBeschikbaar(tenantId: string, medewerkerId: string, regelId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.nietBeschikbaar = p.nietBeschikbaar.filter((n) => !(n.id === regelId && n.medewerkerId === medewerkerId));
  });
  return planning;
}

// ---- ruilen en open diensten ----------------------------------------------

const lopend = (r: Ruil): boolean => r.status === "aangeboden" || r.status === "geaccepteerd";

/** Een eigen dienst aanbieden aan het team (naar = niemand in het bijzonder) of aan één collega. */
export async function biedDienstAan(tenantId: string, medewerkerId: string, dienstId: string, naar: string | null, nu: Date = new Date()): Promise<Planning> {
  if (naar) await eisActief(tenantId, naar);
  const { planning } = await wijzig(tenantId, (p) => {
    const d = p.diensten.find((x) => x.id === dienstId);
    if (!d || d.medewerkerId !== medewerkerId) throw AppError.notFound("Deze dienst is niet van jou.");
    if (d.datum < amsterdamDayKey(nu)) throw AppError.precondition("Een dienst in het verleden kun je niet meer ruilen.");
    if (p.ruilen.some((r) => r.dienstId === dienstId && lopend(r))) throw AppError.conflict("Voor deze dienst loopt al een verzoek.");
    p.ruilen.push({ id: nieuwId(), dienstId, van: medewerkerId, naar, status: "aangeboden", op: nu.toISOString() });
  });
  return planning;
}

/** Een collega neemt een aangeboden dienst aan; de beheerder moet het nog goedkeuren. */
export async function neemRuilAan(tenantId: string, medewerkerId: string, ruilId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    const r = p.ruilen.find((x) => x.id === ruilId);
    if (!r || r.status !== "aangeboden" || r.van === null) throw AppError.notFound("Dit aanbod bestaat niet meer.");
    if (r.van === medewerkerId) throw AppError.validation("Je kunt je eigen dienst niet zelf aannemen.");
    if (r.naar !== null && r.naar !== medewerkerId) throw AppError.forbidden("Dit aanbod is voor een collega.");
    const d = p.diensten.find((x) => x.id === r.dienstId);
    if (!d) throw AppError.notFound("Deze dienst bestaat niet meer.");
    p.ruilen = p.ruilen.map((x) => (x.id === ruilId ? { ...x, naar: medewerkerId, status: "geaccepteerd" } : x));
  });
  return planning;
}

/** Een open dienst nemen; de beheerder moet het nog goedkeuren. */
export async function neemOpenDienst(tenantId: string, medewerkerId: string, dienstId: string, nu: Date = new Date()): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    const d = p.diensten.find((x) => x.id === dienstId);
    if (!d || d.medewerkerId !== null) throw AppError.notFound("Deze open dienst bestaat niet meer.");
    if (p.ruilen.some((r) => r.dienstId === dienstId && r.naar === medewerkerId && lopend(r))) throw AppError.conflict("Je hebt je al gemeld voor deze dienst.");
    p.ruilen.push({ id: nieuwId(), dienstId, van: null, naar: medewerkerId, status: "geaccepteerd", op: nu.toISOString() });
  });
  return planning;
}

/** Een eigen verzoek intrekken (alleen zolang het loopt). */
export async function trekRuilIn(tenantId: string, medewerkerId: string, ruilId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.ruilen = p.ruilen.map((r) => (r.id === ruilId && lopend(r) && (r.van === medewerkerId || (r.van === null && r.naar === medewerkerId)) ? { ...r, status: "ingetrokken" } : r));
  });
  return planning;
}

/** De beheerder keurt een geaccepteerd verzoek goed of af. Goedkeuren zet de dienst op de nieuwe persoon. */
export async function beoordeelRuil(tenantId: string, ruilId: string, besluit: "goedkeuren" | "afwijzen"): Promise<{ planning: Planning; waarschuwingen: PlanWaarschuwing[] }> {
  const { planning, uit } = await wijzig(tenantId, (p) => {
    const r = p.ruilen.find((x) => x.id === ruilId);
    if (!r || r.status !== "geaccepteerd" || r.naar === null) throw AppError.precondition("Dit verzoek wacht niet (meer) op jouw besluit.");
    if (besluit === "afwijzen") {
      p.ruilen = p.ruilen.map((x) => (x.id === ruilId ? { ...x, status: "afgewezen" } : x));
      return [] as PlanWaarschuwing[];
    }
    const d = p.diensten.find((x) => x.id === r.dienstId);
    if (!d) throw AppError.notFound("Deze dienst bestaat niet meer.");
    if (d.medewerkerId !== r.van) throw AppError.precondition("Deze dienst is intussen van iemand anders geworden.");
    const w = waarschuwingen(p, { ...d, medewerkerId: r.naar });
    p.diensten = p.diensten.map((x) => (x.id === d.id ? { ...x, medewerkerId: r.naar } : x));
    p.ruilen = p.ruilen.map((x) => (x.id === ruilId ? { ...x, status: "goedgekeurd" } : x.dienstId === d.id && lopend(x) ? { ...x, status: "afgewezen" } : x));
    return w;
  });
  return { planning, waarschuwingen: uit };
}

// ---- verlof ----------------------------------------------------------------

export async function vraagVerlof(tenantId: string, medewerkerId: string, i: { van: string; tot: string; reden: string }, nu: Date = new Date()): Promise<Planning> {
  if (!isDatum(i.van) || !isDatum(i.tot)) throw AppError.validation("Kies geldige datums.");
  if (i.tot < i.van) throw AppError.validation("De laatste dag mag niet voor de eerste dag liggen.");
  if (dagenTussen(i.van, i.tot) > 60) throw AppError.validation("Vraag verlof aan voor hooguit 60 dagen tegelijk.");
  const { planning } = await wijzig(tenantId, (p) => {
    if (p.verlof.some((v) => v.medewerkerId === medewerkerId && (v.status === "aangevraagd" || v.status === "goedgekeurd") && v.van <= i.tot && i.van <= v.tot)) {
      throw AppError.conflict("Je hebt in deze periode al verlof aangevraagd.");
    }
    p.verlof.push({ id: nieuwId(), medewerkerId, van: i.van, tot: i.tot, reden: i.reden.trim().slice(0, 300), status: "aangevraagd", op: nu.toISOString() });
  });
  return planning;
}

export async function trekVerlofIn(tenantId: string, medewerkerId: string, verlofId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.verlof = p.verlof.map((v) => (v.id === verlofId && v.medewerkerId === medewerkerId && (v.status === "aangevraagd" || v.status === "goedgekeurd") ? { ...v, status: "ingetrokken" } : v));
  });
  return planning;
}

export async function beoordeelVerlof(tenantId: string, verlofId: string, besluit: "goedkeuren" | "afwijzen"): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    const v = p.verlof.find((x) => x.id === verlofId);
    if (!v || v.status !== "aangevraagd") throw AppError.precondition("Deze aanvraag wacht niet (meer) op jouw besluit.");
    p.verlof = p.verlof.map((x) => (x.id === verlofId ? { ...x, status: besluit === "goedkeuren" ? "goedgekeurd" : "afgewezen" } : x));
  });
  return planning;
}

// ---- fooi ------------------------------------------------------------------

/** Een fooienpot vastleggen en verdelen naar de gewerkte uren in de periode (lib/horeca-personeel/planning.ts, verdeelFooi). */
export async function bewaarFooi(tenantId: string, i: { van: string; tot: string; totaalCent: number; notitie: string }, nu: Date = new Date()): Promise<Planning> {
  if (!isDatum(i.van) || !isDatum(i.tot) || i.tot < i.van) throw AppError.validation("Kies een geldige periode.");
  if (!Number.isInteger(i.totaalCent) || i.totaalCent < 1) throw AppError.validation("Vul een bedrag in.");
  const { planning } = await wijzig(tenantId, (p) => {
    const verdeling = verdeelFooi(p, i.van, i.tot, i.totaalCent);
    if (verdeling.length === 0) throw AppError.precondition("In deze periode zijn geen uren geregistreerd, dus er is niets te verdelen.");
    p.fooien.push({ id: nieuwId(), van: i.van, tot: i.tot, totaalCent: i.totaalCent, verdeling, notitie: i.notitie.trim().slice(0, 300), op: nu.toISOString() });
    p.fooien = p.fooien.slice(-MAX_FOOIEN);
  });
  return planning;
}

export async function verwijderFooi(tenantId: string, fooiId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.fooien = p.fooien.filter((f) => f.id !== fooiId);
  });
  return planning;
}

// ---- uren ------------------------------------------------------------------

/** Inklokken met de tijd van nu (Amsterdam). Een tweede keer inklokken zonder uitklokken kan niet. */
export async function klokIn(tenantId: string, medewerkerId: string, nu: Date = new Date()): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    if (p.uren.some((u) => u.medewerkerId === medewerkerId && u.uit === null)) throw AppError.conflict("Je bent al ingeklokt.");
    p.uren.push({ id: nieuwId(), medewerkerId, datum: amsterdamDayKey(nu), in: amsterdamClock(nu), uit: null, bron: "klok" });
  });
  return planning;
}

export async function klokUit(tenantId: string, medewerkerId: string, nu: Date = new Date()): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    const u = p.uren.find((x) => x.medewerkerId === medewerkerId && x.uit === null);
    if (!u) throw AppError.precondition("Je bent niet ingeklokt.");
    p.uren = p.uren.map((x) => (x.id === u.id ? { ...x, uit: amsterdamClock(nu) } : x));
  });
  return planning;
}

/** De beheerder voegt een urenregel toe of corrigeert er een. */
export async function bewaarUur(tenantId: string, i: { id?: string | undefined; medewerkerId: string; datum: string; in: string; uit: string | null }): Promise<Planning> {
  if (!isDatum(i.datum) || !isTijd(i.in) || (i.uit !== null && !isTijd(i.uit))) throw AppError.validation("Vul datum en tijden goed in.");
  await eisActief(tenantId, i.medewerkerId).catch(() => {
    // ook voor een gestopte medewerker mag de beheerder een regel corrigeren; alleen een onbekende id weigert
  });
  const d = await leesPersoneelVan(tenantId);
  if (!d.medewerkers.some((m) => m.id === i.medewerkerId)) throw AppError.notFound("Deze medewerker staat niet in je lijst.");
  const { planning } = await wijzig(tenantId, (p) => {
    const regel: Uur = { id: i.id ?? nieuwId(), medewerkerId: i.medewerkerId, datum: i.datum, in: i.in, uit: i.uit, bron: "beheer" };
    if (i.id && p.uren.some((u) => u.id === i.id)) p.uren = p.uren.map((u) => (u.id === i.id ? regel : u));
    else p.uren.push(regel);
  });
  return planning;
}

export async function verwijderUur(tenantId: string, uurId: string): Promise<Planning> {
  const { planning } = await wijzig(tenantId, (p) => {
    p.uren = p.uren.filter((u) => u.id !== uurId);
  });
  return planning;
}
