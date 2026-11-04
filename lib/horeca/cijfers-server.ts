import { prisma } from "@/lib/prisma";
import { berekenCijfers, type Cijfers } from "@/lib/horeca/cijfers";
import { nuNL } from "@/lib/horeca/reserveringen";

/** De cijfers van de laatste `dagen` dagen (t/m vandaag, Nederlandse tijd). */
export async function cijfersVan(zaakId: string, dagen: number): Promise<Cijfers> {
  const { datum: vandaag } = nuNL();
  const [y, m, d] = vandaag.split("-").map(Number);
  const van = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - (dagen - 1))).toISOString().slice(0, 10);
  // ruim genoeg ophalen (een dag extra voor het tijdverschil); berekenCijfers deelt per Nederlandse dag in
  const sinds = new Date(Date.now() - (dagen + 1) * 24 * 60 * 60 * 1000);
  const [bestellingen, reserveringen] = await Promise.all([
    prisma.horecaBestelling.findMany({ where: { zaakId, createdAt: { gte: sinds } }, select: { totaalCent: true, status: true, createdAt: true, regels: true, bron: true } }),
    prisma.horecaReservering.findMany({ where: { zaakId, datum: { gte: van, lte: vandaag } }, select: { datum: true, tijd: true, personen: true, status: true, bron: true } }),
  ]);
  return berekenCijfers(van, vandaag, vandaag, bestellingen, reserveringen);
}
