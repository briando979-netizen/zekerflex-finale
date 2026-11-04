import type { Rijschool, RijschoolBericht, RijschoolLeerling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { claimIdempotency } from "@/lib/redis";
import { berichtAanLeerlingMail, berichtAanSchoolMail, verstuur } from "@/lib/rijschool/mail";
import { BERICHT_MAX, gesprekkenUit, schoonBericht, type BerichtRij, type Gesprek } from "@/lib/rijschool/berichten-lijst";

// ---------------------------------------------------------------------------
// Berichten tussen een leerling en de rijschool: één gesprek per leerling. De
// leerling schrijft in de app; namens de school schrijft het beheer. Bij een
// nieuw bericht krijgt de ander een seintje per mail, hoogstens één per kwartier
// per gesprek en richting, zodat een vlot gesprek geen stapel mails geeft.
// Bewaartermijn: lib/privacy/retention.ts ("rijschool_berichten").
// ---------------------------------------------------------------------------

/** Zo lang na een seintje komt er geen nieuw seintje voor hetzelfde gesprek. */
const MAIL_RUST_SEC = 15 * 60;

const rij = (b: Pick<RijschoolBericht, "id" | "vanLeerling" | "afzender" | "tekst" | "createdAt" | "gelezenOm">): BerichtRij => ({
  id: b.id,
  vanLeerling: b.vanLeerling,
  afzender: b.afzender,
  tekst: b.tekst,
  at: b.createdAt.toISOString(),
  gelezen: b.gelezenOm !== null,
});

/** Het gesprek met één leerling, oudste bericht eerst (de laatste `max`). */
export async function gesprekMet(leerlingId: string, max = 200): Promise<BerichtRij[]> {
  const rijen = await prisma.rijschoolBericht.findMany({ where: { leerlingId }, orderBy: { createdAt: "desc" }, take: max });
  return rijen.reverse().map(rij);
}

/** Alle gesprekken van een rijschool voor het beheer, het meest recente bovenaan. */
export async function gesprekkenVan(rijschoolId: string): Promise<Gesprek[]> {
  const [recent, ongelezen] = await Promise.all([
    prisma.rijschoolBericht.findMany({
      where: { rijschoolId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { leerling: { select: { naam: true } } },
    }),
    prisma.rijschoolBericht.groupBy({ by: ["leerlingId"], where: { rijschoolId, vanLeerling: true, gelezenOm: null }, _count: { _all: true } }),
  ]);
  const gesprekken = gesprekkenUit(recent.map((b) => ({ ...rij(b), leerlingId: b.leerlingId, leerlingNaam: b.leerling.naam })));
  // het aantal ongelezen telt ook berichten van buiten de laatste 500
  const telling = new Map(ongelezen.map((g) => [g.leerlingId, g._count._all]));
  return gesprekken.map((g) => ({ ...g, ongelezen: telling.get(g.leerlingId) ?? 0 }));
}

type Van = { leerling: true } | { leerling: false; afzender: string };

/** Bewaar een nieuw bericht en geef de ander (hoogstens eens per kwartier) een seintje per mail. */
export async function stuurBericht(r: Rijschool, l: Pick<RijschoolLeerling, "id" | "rijschoolId" | "naam" | "email">, van: Van, ruw: string): Promise<BerichtRij> {
  if (l.rijschoolId !== r.id) throw AppError.notFound("Leerling niet gevonden.");
  const tekst = schoonBericht(ruw);
  if (!tekst) throw AppError.validation("Schrijf eerst een bericht.");
  if (tekst.length > BERICHT_MAX) throw AppError.validation(`Een bericht mag hoogstens ${BERICHT_MAX} tekens lang zijn.`);
  const afzender = van.leerling ? "" : van.afzender.trim().slice(0, 100);
  const b = await prisma.rijschoolBericht.create({ data: { rijschoolId: r.id, leerlingId: l.id, vanLeerling: van.leerling, afzender, tekst } });
  if (await magSeintje(`rijschool-bericht:${l.id}:${van.leerling ? "aan-school" : "aan-leerling"}`)) {
    await verstuur(van.leerling ? berichtAanSchoolMail(r, l, tekst) : berichtAanLeerlingMail(r, l, afzender, tekst));
  }
  return rij(b);
}

/** Markeer wat de ander stuurde als gelezen: de leerling leest berichten van de school, de school die van de leerling. */
export async function markeerGelezen(leerlingId: string, doorLeerling: boolean): Promise<number> {
  const { count } = await prisma.rijschoolBericht.updateMany({ where: { leerlingId, vanLeerling: !doorLeerling, gelezenOm: null }, data: { gelezenOm: new Date() } });
  return count;
}

async function magSeintje(sleutel: string): Promise<boolean> {
  try {
    return await claimIdempotency(sleutel, MAIL_RUST_SEC);
  } catch (err) {
    // Redis weg: liever een seintje te veel dan een gemist bericht
    logger.warn("rijschool: seintje-rust niet te controleren", { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
}
