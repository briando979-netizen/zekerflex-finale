import type { HorecaBetaling, HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { tekenMet } from "@/lib/horeca/link";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamToUtc } from "@/lib/time/amsterdam";
import { leesRegels } from "@/lib/horeca/bestellen";
import { plusDagen } from "@/lib/horeca/reserveren";
import { alles, betaalRegels, deelRegels, rekeningVan, totaalVan, zRapport, type BonRegel, type Methode, type Selectie } from "@/lib/horeca/kassa";

// ---------------------------------------------------------------------------
// De kassa op de server. Afrekenen gebeurt onder een rijslot op de bestellingen
// (twee kassa's tegelijk rekenen nooit dezelfde regel af) en een slot op het
// bonnummer per zaak. Bedragen komen altijd van de vastgelegde bestelregels,
// nooit van de browser. Elke betaling krijgt een eigen bon met de regels en hun
// btw, zodat de dagafsluiting per tarief klopt.
// ---------------------------------------------------------------------------

export interface Deel {
  methode: Methode;
  /** bij één deel genegeerd (de server rekent het totaal) */
  bedragCent: number;
  fooiCent: number;
}

export interface KassaInstellingen {
  voettekst: string;
}

export function leesKassa(json: unknown): KassaInstellingen {
  const k = (json ?? {}) as { voettekst?: unknown };
  return { voettekst: typeof k.voettekst === "string" ? k.voettekst.slice(0, 300) : "Bedankt en tot ziens!" };
}

export const bewaarKassa = (zaak: HorecaZaak, k: { btwNummer: string; voettekst: string }) =>
  prisma.horecaZaak.update({ where: { id: zaak.id }, data: { btwNummer: k.btwNummer, kassa: { voettekst: k.voettekst } } });

/**
 * Afrekenen: de hele rekening of een selectie (per gerecht), van een tafel of
 * één bestelling zonder tafel, in één of meer delen (splitsen) met elk een
 * eigen betaalwijze en fooi. Geeft de bonnen terug.
 */
export async function afrekenen(
  zaak: HorecaZaak,
  a: { tafelId: string | null; bestellingId: string | null; selectie: Selectie[] | null; delen: Deel[]; door: string },
): Promise<HorecaBetaling[]> {
  if (!a.delen.length) throw AppError.validation("Kies hoe er betaald wordt.");
  if (!a.tafelId && !a.bestellingId) throw AppError.validation("Kies een tafel of bestelling.");
  return prisma.$transaction(async (tx) => {
    const rijen = a.bestellingId
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HorecaBestelling" WHERE id = ${a.bestellingId} AND "zaakId" = ${zaak.id} AND betaald = false AND status <> 'GEANNULEERD' FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HorecaBestelling" WHERE "tafelId" = ${a.tafelId} AND "zaakId" = ${zaak.id} AND betaald = false AND status <> 'GEANNULEERD' FOR UPDATE`;
    if (!rijen.length) throw AppError.conflict("Er staat niets (meer) open. Ververs de rekening.");
    const lijst = (await tx.horecaBestelling.findMany({ where: { id: { in: rijen.map((r) => r.id) } }, orderBy: { createdAt: "asc" }, select: { id: true, nummer: true, status: true, betaald: true, regels: true } })).map((b) => ({ ...b, regels: leesRegels(b.regels) }));
    const rekening = rekeningVan(lijst);
    const selectie = a.selectie ?? alles(rekening);
    if (!selectie.length) throw AppError.validation("Kies wat er afgerekend wordt.");

    // de geselecteerde regels met hun prijs en btw (van de server)
    const bonRegels: BonRegel[] = selectie.map((s) => {
      const r = rekening.find((x) => x.bestellingId === s.bestellingId && x.index === s.index);
      if (!r) throw AppError.conflict("Een regel staat niet (meer) op de rekening. Ververs de rekening.");
      if (s.aantal > r.aantal) throw AppError.conflict(`Van ${r.naam} staat nog ${r.aantal} open.`);
      return { naam: r.naam, prijsCent: r.prijsCent, aantal: s.aantal, btw: r.btw };
    });
    const totaal = totaalVan(bonRegels);
    const bedragen = a.delen.length === 1 ? [totaal] : a.delen.map((d) => d.bedragCent);
    if (bedragen.some((b) => !Number.isInteger(b) || b < 0) || bedragen.reduce((s, b) => s + b, 0) !== totaal) {
      throw AppError.validation("De delen tellen niet op tot het totaal. Verdeel opnieuw.");
    }
    const perDeel = a.delen.length === 1 ? [bonRegels] : deelRegels(bonRegels, bedragen);

    // regels per bestelling bijwerken
    const gewijzigd: string[] = [];
    for (const b of lijst) {
      const eigen = selectie.filter((s) => s.bestellingId === b.id).map(({ index, aantal }) => ({ index, aantal }));
      if (!eigen.length) continue;
      const uit = betaalRegels(b.regels, eigen);
      if ("fout" in uit) throw AppError.conflict(uit.fout);
      gewijzigd.push(b.id);
      await tx.horecaBestelling.update({ where: { id: b.id }, data: { regels: uit.regels as unknown as object[], betaald: uit.helemaal } });
    }

    // bonnummers op volgorde, per zaak
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horeca-bon:${zaak.id}`}))`;
    const laatste = await tx.horecaBetaling.aggregate({ where: { zaakId: zaak.id }, _max: { bonNummer: true } });
    let nummer = laatste._max.bonNummer ?? 0;
    const nu = new Date();
    const tafelId = a.tafelId ?? (await tx.horecaBestelling.findUnique({ where: { id: a.bestellingId ?? "" }, select: { tafelId: true } }))?.tafelId ?? null;
    const bonnen: HorecaBetaling[] = [];
    for (const [i, d] of a.delen.entries()) {
      nummer += 1;
      bonnen.push(
        await tx.horecaBetaling.create({
          data: {
            zaakId: zaak.id,
            tafelId,
            bedragCent: bedragen[i] ?? 0,
            fooiCent: Math.max(0, Math.min(100_000, Math.round(d.fooiCent))),
            status: "BETAALD",
            methode: d.methode,
            door: a.door.slice(0, 60),
            regels: (perDeel[i] ?? []) as unknown as object[],
            bestellingIds: gewijzigd,
            bonNummer: nummer,
            betaaldOp: nu,
          },
        }),
      );
    }
    return bonnen;
  });
}

/** Wat er op de bon staat: de zaak, de betaling en de tafel. */
export async function bonVan(zaak: HorecaZaak, b: HorecaBetaling) {
  const tafel = b.tafelId ? await prisma.horecaTafel.findFirst({ where: { id: b.tafelId, zaakId: zaak.id }, select: { naam: true } }) : null;
  return {
    id: b.id,
    bonNummer: b.bonNummer,
    op: (b.betaaldOp ?? b.createdAt).toISOString(),
    tafel: tafel?.naam ?? null,
    methode: b.methode,
    bedragCent: b.bedragCent,
    fooiCent: b.fooiCent,
    regels: Array.isArray(b.regels) ? (b.regels as unknown as BonRegel[]) : [],
    door: b.door,
    // ondertekende link voor de gast (QR-code, mail, pdf): lib/horeca/bon.ts
    token: tekenMet(env.AUTH_SECRET, "bon", b.id),
  };
}

export type Bon = Awaited<ReturnType<typeof bonVan>>;

/** De gegevens van de zaak die op elke bon staan. */
export const bonKop = (zaak: HorecaZaak) => ({ naam: zaak.naam, adres: zaak.adres, plaats: zaak.plaats, telefoon: zaak.telefoon, kvk: zaak.kvk, btwNummer: zaak.btwNummer, voettekst: leesKassa(zaak.kassa).voettekst });

/** De bonnen van één Nederlandse dag. */
async function betalingenOp(zaak: HorecaZaak, datum: string) {
  const [y, m, d] = datum.split("-").map(Number);
  const [y2, m2, d2] = plusDagen(datum, 1).split("-").map(Number);
  const van = amsterdamToUtc(y ?? 1970, m ?? 1, d ?? 1);
  const tot = amsterdamToUtc(y2 ?? 1970, m2 ?? 1, d2 ?? 1);
  return prisma.horecaBetaling.findMany({ where: { zaakId: zaak.id, status: "BETAALD", betaaldOp: { gte: van, lt: tot } }, orderBy: { betaaldOp: "asc" } });
}

const kKas = (zaakId: string, datum: string) => `horeca:kas:${zaakId}:${datum}`;

/** Dagafsluiting: Z-rapport, de bonnen en de kastelling van die dag. */
export async function dagafsluiting(zaak: HorecaZaak, datum: string) {
  const lijst = await betalingenOp(zaak, datum);
  const bonnen = await Promise.all(lijst.map((b) => bonVan(zaak, b)));
  return {
    datum,
    rapport: zRapport(lijst.map((b) => ({ bedragCent: b.bedragCent, fooiCent: b.fooiCent, methode: b.methode, regels: Array.isArray(b.regels) ? (b.regels as unknown as BonRegel[]) : [] }))),
    bonnen,
    kop: bonKop(zaak),
    telling: await kvGet<{ geteldCent: number; door: string; op: string }>(kKas(zaak.id, datum)),
  };
}

/** De kas tellen aan het eind van de dag (verwacht contant tegenover geteld). */
export async function telKas(zaak: HorecaZaak, datum: string, geteldCent: number, door: string) {
  await kvSet(kKas(zaak.id, datum), { geteldCent, door: door.slice(0, 60), op: new Date().toISOString() });
}

/** Alle bonnen van een periode als CSV voor de boekhouder (puntkomma's, Nederlandse bedragen). */
export async function kassaCsv(zaak: HorecaZaak, van: string, tot: string): Promise<string> {
  const rijen: string[][] = [];
  for (let datum = van, n = 0; datum <= tot && n < 93; datum = plusDagen(datum, 1), n++) {
    for (const b of await betalingenOp(zaak, datum)) {
      const regels = Array.isArray(b.regels) ? (b.regels as unknown as BonRegel[]) : [];
      const per = (t: number) => regels.filter((r) => r.btw === t).reduce((s, r) => s + r.prijsCent * r.aantal, 0);
      const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
      rijen.push([String(b.bonNummer ?? ""), datum, new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(b.betaaldOp ?? b.createdAt), b.methode, bedrag(b.bedragCent), bedrag(b.fooiCent), bedrag(per(9)), bedrag(per(21)), bedrag(per(0)), b.door]);
    }
  }
  const veld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const kop = ["Bon", "Datum", "Tijd", "Betaalwijze", "Bedrag incl. btw", "Fooi", "Omzet 9%", "Omzet 21%", "Omzet 0%", "Door"];
  return `﻿${[kop, ...rijen].map((r) => r.map(veld).join(";")).join("\r\n")}`;
}
