import { randomBytes } from "crypto";
import type { HorecaBestelling, HorecaBestellingStatus, HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { bouwRegels, leesRegels, type BestelRegel, type MandRegel } from "@/lib/horeca/bestellen";
import { stapVoorStatus, statusUit, verplaats, type Fase, type Filter } from "@/lib/horeca/fasen";

// ---------------------------------------------------------------------------
// Tafels en bestellingen van een zaak. Elke tafel heeft een willekeurige code
// in zijn QR-link; een nieuwe code maakt de oude QR ongeldig. Een bestelling
// krijgt een volgnummer per zaak onder een databaseslot, zodat twee
// bestellingen tegelijk nooit hetzelfde nummer krijgen.
// ---------------------------------------------------------------------------

export const nieuweCode = () => randomBytes(9).toString("base64url");

export const tafelsVan = (zaakId: string) => prisma.horecaTafel.findMany({ where: { zaakId }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] });

export async function bewaarTafel(zaak: HorecaZaak, t: { id?: string | undefined; naam: string; plaatsen: number; zone: string; actief: boolean }) {
  const { id, ...data } = t;
  if (!id) {
    const volgorde = await prisma.horecaTafel.count({ where: { zaakId: zaak.id } });
    return prisma.horecaTafel.create({ data: { ...data, zaakId: zaak.id, code: nieuweCode(), volgorde } });
  }
  const r = await prisma.horecaTafel.updateMany({ where: { id, zaakId: zaak.id }, data });
  if (!r.count) throw AppError.notFound("Tafel niet gevonden.");
}

/** Nieuwe QR-code voor een tafel: de oude geprinte code werkt dan niet meer. */
export async function vernieuwCode(zaak: HorecaZaak, id: string) {
  const r = await prisma.horecaTafel.updateMany({ where: { id, zaakId: zaak.id }, data: { code: nieuweCode() } });
  if (!r.count) throw AppError.notFound("Tafel niet gevonden.");
}

export async function verwijderTafel(zaak: HorecaZaak, id: string) {
  const r = await prisma.horecaTafel.deleteMany({ where: { id, zaakId: zaak.id } });
  if (!r.count) throw AppError.notFound("Tafel niet gevonden.");
}

/** De tafel achter een QR-code, alleen bij deze zaak en als hij actief is. */
export const tafelVanCode = (zaakId: string, code: string) => prisma.horecaTafel.findFirst({ where: { zaakId, code, actief: true } });

/**
 * Een bestelling plaatsen. Prijzen en namen komen van de menukaart (bouwRegels);
 * het volgnummer onder een slot per zaak.
 */
export async function plaatsBestelling(
  zaak: HorecaZaak,
  b: { tafelId: string | null; mand: MandRegel[]; opmerking: string; naam: string; bron: "qr" | "bediening" | "kassa" },
): Promise<HorecaBestelling> {
  if (b.tafelId && !(await prisma.horecaTafel.findFirst({ where: { id: b.tafelId, zaakId: zaak.id }, select: { id: true } }))) {
    throw AppError.validation("Kies een bestaande tafel.");
  }
  const kaart = await prisma.horecaItem.findMany({ where: { zaakId: zaak.id }, select: { id: true, naam: true, prijsCent: true, beschikbaar: true, station: true, btw: true } });
  const r = bouwRegels(b.mand, kaart);
  if ("fout" in r) throw AppError.validation(r.fout);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horeca-bestelling:${zaak.id}`}))`;
    const laatste = await tx.horecaBestelling.findFirst({ where: { zaakId: zaak.id }, orderBy: { nummer: "desc" }, select: { nummer: true } });
    return tx.horecaBestelling.create({
      data: {
        zaakId: zaak.id,
        tafelId: b.tafelId,
        nummer: (laatste?.nummer ?? 0) + 1,
        regels: r.regels as unknown as object[],
        totaalCent: r.totaalCent,
        opmerking: b.opmerking.trim().slice(0, 300),
        naam: b.naam.trim().slice(0, 60),
        bron: b.bron,
      },
    });
  });
}

/** Open bestellingen plus wat de laatste 12 uur geserveerd of geannuleerd is. */
export async function bestellingenVan(zaakId: string) {
  const sinds = new Date(Date.now() - 12 * 3600_000);
  const lijst = await prisma.horecaBestelling.findMany({
    where: { zaakId, OR: [{ status: { in: ["NIEUW", "IN_BEREIDING", "KLAAR"] } }, { updatedAt: { gte: sinds } }] },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { tafel: { select: { naam: true } } },
  });
  return lijst.map((b) => ({ ...b, regels: leesRegels(b.regels), tafelNaam: b.tafel?.naam ?? null }));
}

/**
 * Een stap zetten (lib/horeca/fasen.ts) voor één bestelling of voor alle
 * onbetaalde bestellingen van een tafel, voor één station of alles. Regels en
 * status gaan samen, onder een rijslot: keuken en bar tikken tegelijk zonder
 * elkaars werk te overschrijven. Geeft terug hoeveel bestellingen veranderden.
 */
export async function verplaatsFase(zaak: HorecaZaak, wie: { id: string } | { tafelId: string }, filter: Filter, stap: { van: readonly Fase[]; naar: Fase; laatste?: boolean }): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rijen =
      "id" in wie
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HorecaBestelling" WHERE id = ${wie.id} AND "zaakId" = ${zaak.id} AND status <> 'GEANNULEERD' FOR UPDATE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HorecaBestelling" WHERE "tafelId" = ${wie.tafelId} AND "zaakId" = ${zaak.id} AND betaald = false AND status <> 'GEANNULEERD' FOR UPDATE`;
    if (!rijen.length && "id" in wie) throw AppError.notFound("Deze bestelling bestaat niet (meer) of is geannuleerd.");
    const lijst = await tx.horecaBestelling.findMany({ where: { id: { in: rijen.map((r) => r.id) } }, select: { id: true, regels: true } });
    const nu = new Date().toISOString();
    // "Ongedaan maken" voor een hele tafel: alleen de bestellingen van die ene serveerronde
    const ronde = stap.laatste ? lijst.flatMap((b) => leesRegels(b.regels).map((r) => r.geserveerdOp ?? "")).sort().pop() ?? "" : "";
    let gewijzigd = 0;
    for (const b of lijst) {
      const oud = leesRegels(b.regels);
      if (stap.laatste && !oud.some((r) => r.geserveerdOp === ronde)) continue;
      const regels = verplaats(oud, filter, stap.van, stap.naar, nu, stap.laatste === true);
      if (JSON.stringify(regels) === JSON.stringify(oud)) continue;
      gewijzigd++;
      await tx.horecaBestelling.update({ where: { id: b.id }, data: { regels: regels as unknown as object[], status: statusUit(regels) } });
    }
    return gewijzigd;
  });
}

export async function zetBestelStatus(zaak: HorecaZaak, id: string, status: HorecaBestellingStatus) {
  if (status !== "GEANNULEERD") {
    await verplaatsFase(zaak, { id }, "alles", stapVoorStatus(status));
    return;
  }
  const r = await prisma.horecaBestelling.updateMany({ where: { id, zaakId: zaak.id }, data: { status } });
  if (!r.count) throw AppError.notFound("Bestelling niet gevonden.");
}

/** Na het afrekenen (pin, contant): de onbetaalde bestellingen van de tafel als betaald, de tafel is weer vrij. */
export async function tafelVrij(zaak: HorecaZaak, tafelId: string): Promise<number> {
  const r = await prisma.horecaBestelling.updateMany({ where: { zaakId: zaak.id, tafelId, betaald: false, status: { not: "GEANNULEERD" } }, data: { betaald: true } });
  return r.count;
}

/** Wat de gast na het bestellen ziet: alleen met de tafelcode erbij (geen raden van id's). */
export async function bestellingVoorGast(zaakId: string, tafelCode: string, id: string): Promise<{ nummer: number; status: HorecaBestellingStatus; regels: BestelRegel[]; totaalCent: number } | null> {
  const b = await prisma.horecaBestelling.findFirst({ where: { id, zaakId, tafel: { code: tafelCode } }, select: { nummer: true, status: true, regels: true, totaalCent: true } });
  return b ? { ...b, regels: leesRegels(b.regels) } : null;
}
