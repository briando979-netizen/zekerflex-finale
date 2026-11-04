import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { plusDagen, type Bezet } from "@/lib/horeca/reserveren";
import { controleerReservering, heeftPlek, isReserveerNummer, leesReserveerInvoer, nuInNL, tijdenVoor, voorbeeldVol, type Nu, type ReserveerBlok, type ReserveerInvoer, type ReserveerStatus, type SiteReservering } from "@/lib/sites/reserveren";
import type { ReserveerPagina } from "@/lib/sites/render";
import type { LiveSite } from "@/lib/sites/store";

// ---------------------------------------------------------------------------
// Tafelreserveringen van een klantsite (lib/sites/reserveren.ts) bewaren en lezen.
//   KV "site-reservering:<siteId>:<datum>:<id>" — één reservering met de gast
// De datum zit in de sleutel, zodat de bezetting van één dag één opvraging is.
// Een online reservering wordt onder een slot per site en dag opnieuw
// gecontroleerd (twee gasten tegelijk kunnen de laatste plek niet allebei
// krijgen). Het formulier zelf: lib/sites/reserveringen.ts.
// ---------------------------------------------------------------------------

export { RESERVEER_STATUSSEN, type ReserveerStatus, type SiteReservering } from "@/lib/sites/reserveren";

const prefix = (siteId: string) => `site-reservering:${siteId}:`;
const dagPrefix = (siteId: string, datum: string) => `${prefix(siteId)}${datum}:`;
const isId = (s: string) => /^r\d{8}[a-z0-9]{8,16}$/.test(s);
const datumUitId = (id: string) => `${id.slice(1, 5)}-${id.slice(5, 7)}-${id.slice(7, 9)}`;
const sleutel = (siteId: string, id: string) => `${dagPrefix(siteId, datumUitId(id))}${id}`;

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const nummer = () => [...randomBytes(6)].map((b) => LETTERS[b % LETTERS.length]).join("");

/** Wat een dag bezet: alle reserveringen behalve geannuleerde. */
const bezetVan = (rows: SiteReservering[]): Bezet[] => rows.filter((r) => r.status !== "geannuleerd").map((r) => ({ tijd: r.tijd, personen: r.personen }));

export async function bezetOp(siteId: string, datum: string): Promise<Bezet[]> {
  return bezetVan(await kvListValues<SiteReservering>(dagPrefix(siteId, datum), 2000));
}

/**
 * Een reservering bewaren. Online (`bron` website) onder een slot per site en dag opnieuw gecontroleerd;
 * de zaak zelf (beheer) mag overboeken, zoals in het horecapakket.
 */
export async function maakReservering(siteId: string, blok: ReserveerBlok, r: ReserveerInvoer, bron: SiteReservering["bron"], nu: Nu = nuInNL()): Promise<{ rec: SiteReservering } | { fouten: string[] }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`site-reservering:${siteId}:${r.datum}`}))`;
    const rows = await tx.keyValueStore.findMany({ where: { key: { startsWith: dagPrefix(siteId, r.datum) } }, select: { value: true } });
    const bezet = bezetVan(rows.map((x) => x.value as unknown as SiteReservering));
    if (bron === "website") {
      const fouten = controleerReservering(blok, r, bezet, nu);
      if (fouten.length) return { fouten };
    }
    const rec: SiteReservering = { ...r, id: `r${r.datum.replace(/-/g, "")}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, nr: nummer(), at: new Date().toISOString(), status: "bevestigd", bron };
    await tx.keyValueStore.create({ data: { key: sleutel(siteId, rec.id), value: rec as unknown as Prisma.InputJsonValue } });
    return { rec };
  });
}

/** De reserveringen van een site tussen twee dagen (beide meegerekend), op dag en tijd. */
export async function reserveringenVan(siteId: string, van: string, tot: string): Promise<SiteReservering[]> {
  const dagen: string[] = [];
  for (let d = van; d <= tot && dagen.length < 62; d = plusDagen(d, 1)) dagen.push(d);
  const perDag = await Promise.all(dagen.map((d) => kvListValues<SiteReservering>(dagPrefix(siteId, d), 2000)));
  return perDag.flat().sort((a, b) => `${a.datum} ${a.tijd}`.localeCompare(`${b.datum} ${b.tijd}`) || a.at.localeCompare(b.at));
}

/** Alle reserveringen van een site (voor het klantenoverzicht, lib/sites/klanten.ts), nieuwste eerst. */
export async function alleReserveringen(siteId: string, limit = 3000): Promise<SiteReservering[]> {
  return kvListValues<SiteReservering>(prefix(siteId), limit);
}

export async function zetReserveerStatus(siteId: string, id: string, status: ReserveerStatus): Promise<SiteReservering | null> {
  if (!isId(id)) return null;
  const rec = await kvGet<SiteReservering>(sleutel(siteId, id));
  if (!rec) return null;
  const next = { ...rec, status };
  await kvSet(sleutel(siteId, id), next);
  return next;
}

/** Een reservering op nummer (de bevestigingspagina); alleen recente en komende dagen. */
export async function opNummer(siteId: string, nr: string, nu: Nu): Promise<SiteReservering | null> {
  const rows = await kvListValues<SiteReservering>(prefix(siteId), 3000);
  return rows.find((r) => r.nr === nr && r.datum >= plusDagen(nu.datum, -1)) ?? null;
}

/** De pagina …/reserveren: na een dag en aantal de tijden, en als die dag vol is de eerstvolgende dagen met plek. */
export async function reserveerStaat(live: LiveSite, blok: ReserveerBlok, q: URLSearchParams, nu: Nu = nuInNL()): Promise<ReserveerPagina> {
  const invoer = leesReserveerInvoer((k) => q.get(k));
  const geldig = Boolean(invoer.datum && invoer.datum >= nu.datum && invoer.personen >= 1 && invoer.personen <= blok.maxGroep);
  if (!geldig) return { soort: "reserveren", staat: { invoer, tijden: null, fouten: invoer.datum && invoer.datum < nu.datum ? ["Kies een dag vanaf vandaag."] : [], suggesties: [], nu } };
  const demo = Boolean(live.snapshot.voorbeeld || live.snapshot.voorstel);
  const dag = async (d: string) => ({ bezet: demo ? [] : await bezetOp(live.siteId, d), vol: demo ? voorbeeldVol(blok, d) : undefined });
  const eerst = await dag(invoer.datum);
  const tijden = tijdenVoor(blok, invoer.datum, invoer.personen, eerst.bezet, nu, eerst.vol);
  const suggesties: string[] = [];
  if (!tijden.some((t) => t.vrij)) {
    for (let i = 1; i <= 21 && suggesties.length < 3; i++) {
      const d = plusDagen(invoer.datum, i);
      if (d > plusDagen(nu.datum, blok.dagenVooruit)) break;
      const s = await dag(d);
      if (heeftPlek(blok, d, invoer.personen, s.bezet, nu, s.vol)) suggesties.push(d);
    }
  }
  return { soort: "reserveren", staat: { invoer, tijden, fouten: [], suggesties, nu } };
}

/** …/gereserveerd?nr=…: de reservering, of op een voorbeeld de gegevens uit het adres. */
export async function gereserveerdPagina(live: LiveSite, q: URLSearchParams, nu: Nu = nuInNL()): Promise<ReserveerPagina> {
  if (live.snapshot.voorbeeld || live.snapshot.voorstel) {
    const r = leesReserveerInvoer((k) => q.get(k));
    return { soort: "gereserveerd", voorbeeld: true, reservering: r.datum && r.tijd && r.personen ? { nr: "", datum: r.datum, tijd: r.tijd, personen: r.personen } : null };
  }
  const nr = q.get("nr") ?? "";
  const rec = isReserveerNummer(nr) ? await opNummer(live.siteId, nr, nu) : null;
  return { soort: "gereserveerd", voorbeeld: false, reservering: rec ? { nr: rec.nr, datum: rec.datum, tijd: rec.tijd, personen: rec.personen } : null };
}
