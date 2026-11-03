import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { moment, plusDagen } from "@/lib/rijschool/planning";
import { herinneringMail, verstuur } from "@/lib/rijschool/mail";

// ---------------------------------------------------------------------------
// De avond voor een les krijgt de leerling een herinnering per mail. Draait
// dagelijks vanuit deploy/cron (17:00 UTC). Elke les krijgt hoogstens één
// herinnering: een claim in de KeyValueStore (unieke sleutel) gaat vóór de
// mail, dus een tweede run of een herhaalde aanroep stuurt niets dubbel.
// ---------------------------------------------------------------------------

export async function stuurHerinneringen(nu = new Date()): Promise<{ lessen: number; verstuurd: number }> {
  const morgen = plusDagen(amsterdamDayKey(nu), 1);
  const lessen = await prisma.rijschoolLes.findMany({
    where: { status: "GEPLAND", leerlingId: { not: null }, start: { gte: moment(morgen, "00:00"), lt: moment(plusDagen(morgen, 1), "00:00") } },
    include: {
      rijschool: true,
      leerling: { select: { naam: true, email: true, status: true } },
      instructeur: { select: { naam: true } },
    },
    take: 5000,
  });
  let verstuurd = 0;
  for (const les of lessen) {
    if (!les.leerling || les.leerling.status === "GESTOPT") continue;
    try {
      await prisma.keyValueStore.create({ data: { key: `rijschool-herinnering:${les.id}`, value: { at: nu.toISOString() } } });
    } catch (err) {
      // al herinnerd
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    if (await verstuur(herinneringMail(les.rijschool, les.leerling, les, les.instructeur.naam))) verstuurd++;
  }
  return { lessen: lessen.length, verstuurd };
}
