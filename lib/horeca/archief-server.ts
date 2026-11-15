import type { HorecaZaak, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { amsterdamClock, amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";
import { leesRegels } from "@/lib/horeca/bestellen";
import { plusDagen } from "@/lib/horeca/reserveren";
import { archiefCsv, ARCHIEF_BRONNEN, ARCHIEF_SOORTEN, MAX_RIJEN, omzetEnBtw, type ArchiefFilter, type ArchiefRij } from "@/lib/horeca/archief";

// Het archief op de server (lib/horeca/archief.ts is het pure deel): altijd per
// zaak, hooguit MAX_RIJEN rijen, de dagen in Nederlandse tijd.

const dagBegin = (datum: string) => {
  const [y, m, d] = datum.split("-").map(Number);
  return amsterdamToUtc(y ?? 1970, m ?? 1, d ?? 1);
};

function waar(zaak: HorecaZaak, f: ArchiefFilter): Prisma.HorecaBestellingWhereInput {
  const w: Prisma.HorecaBestellingWhereInput = { zaakId: zaak.id, createdAt: { gte: dagBegin(f.van), lt: dagBegin(plusDagen(f.tot, 1)) } };
  if (f.soorten.length < ARCHIEF_SOORTEN.length) w.soort = { in: f.soorten };
  if (f.bronnen.length < ARCHIEF_BRONNEN.length) w.bron = { in: f.bronnen };
  if (!f.geannuleerd) w.status = { not: "GEANNULEERD" };
  if (f.betaald !== "alle") w.betaald = f.betaald === "ja";
  if (f.bezorgerId) w.bezorgerId = f.bezorgerId;
  if (f.zoek) {
    const nummer = /^\d{1,7}$/.test(f.zoek) ? Number(f.zoek) : null;
    w.OR = [
      { naam: { contains: f.zoek, mode: "insensitive" } },
      { adres: { contains: f.zoek, mode: "insensitive" } },
      { postcode: { contains: f.zoek.toUpperCase() } },
      { telefoon: { contains: f.zoek.replace(/\s/g, "") } },
      { tafel: { naam: { contains: f.zoek, mode: "insensitive" } } },
      ...(nummer !== null ? [{ nummer }] : []),
    ];
  }
  return w;
}

async function rijenVan(zaak: HorecaZaak, f: ArchiefFilter): Promise<{ rijen: ArchiefRij[]; meer: boolean }> {
  const lijst = await prisma.horecaBestelling.findMany({
    where: waar(zaak, f),
    orderBy: { createdAt: "desc" },
    take: MAX_RIJEN + 1,
    select: {
      id: true,
      nummer: true,
      createdAt: true,
      soort: true,
      bron: true,
      status: true,
      naam: true,
      adres: true,
      postcode: true,
      plaats: true,
      telefoon: true,
      totaalCent: true,
      kortingCent: true,
      bezorgkostenCent: true,
      betaald: true,
      betaalwijze: true,
      bezorgerId: true,
      regels: true,
      tafel: { select: { naam: true } },
    },
  });
  const rijen = lijst.slice(0, MAX_RIJEN).map(({ tafel, regels, createdAt, ...b }) => ({
    ...b,
    createdAt: createdAt.toISOString(),
    tafelNaam: tafel?.naam ?? null,
    regels: leesRegels(regels).map((r) => ({ btw: typeof r.btw === "number" ? r.btw : 9, prijsCent: r.prijsCent, aantal: r.aantal })),
  }));
  return { rijen, meer: lijst.length > MAX_RIJEN };
}

/** De rijen met de samenvatting (omzet en btw) van de hele selectie. */
export async function archiefVan(zaak: HorecaZaak, f: ArchiefFilter) {
  const { rijen, meer } = await rijenVan(zaak, f);
  return { filter: f, rijen, meer, samenvatting: omzetEnBtw(rijen) };
}

/** Dezelfde selectie als CSV. */
export async function archiefCsvVan(zaak: HorecaZaak, f: ArchiefFilter): Promise<string> {
  const { rijen } = await rijenVan(zaak, f);
  return archiefCsv(rijen, (iso) => ({ datum: amsterdamDayKey(iso), tijd: amsterdamClock(iso) }));
}
