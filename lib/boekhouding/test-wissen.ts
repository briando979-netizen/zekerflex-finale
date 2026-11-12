// ---------------------------------------------------------------------------
// Boekhouding: een TEST-administratie volledig wissen. Weigert bij een ECHTE administratie (en de database weigert
// het ook: de triggers laten UPDATE/DELETE alleen toe als de administratie soort TEST heeft). Alles in een transactie, in
// de volgorde van de foreign keys: eerst wat naar boekingen en rekeningen verwijst, de boekingen zelf, dan de rest.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export interface WisUitkomst {
  administratieId: string;
  /** aantal verwijderde rijen per tabel, in de volgorde waarin gewist is */
  verwijderd: Record<string, number>;
}

/** Wist alle gegevens van een testadministratie en daarna de administratie zelf. */
export async function wisTestAdministratie(administratieId: string): Promise<WisUitkomst> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const administratie = await tx.boekAdministratie.findUnique({
        where: { id: administratieId },
        select: { id: true, soort: true },
      });
      if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
      if (administratie.soort !== "TEST") {
        throw AppError.validation(
          "Alleen een testadministratie kan gewist worden. Een echte administratie is onveranderlijk en blijft bewaard.",
        );
      }

      const verwijderd: Record<string, number> = {};
      const tel = (tabel: string, r: { count: number }) => {
        verwijderd[tabel] = r.count;
      };
      // 1. Wat naar boekingen en rekeningen verwijst (allemaal wijzigbaar of leeg te maken).
      tel("BoekBankTransactie", await tx.boekBankTransactie.deleteMany({ where: { bankRekening: { administratieId } } }));
      tel("BoekBankAfschrift", await tx.boekBankAfschrift.deleteMany({ where: { bankRekening: { administratieId } } }));
      tel("BoekBankRekening", await tx.boekBankRekening.deleteMany({ where: { administratieId } }));
      tel("BoekBon", await tx.boekBon.deleteMany({ where: { administratieId } }));
      tel("BoekBtwAangifte", await tx.boekBtwAangifte.deleteMany({ where: { periode: { administratieId } } }));
      tel("BoekBtwPeriode", await tx.boekBtwPeriode.deleteMany({ where: { administratieId } }));
      // 2. Regels, dan de boekingen: tegenboekingen eerst, want die verwijzen naar de boeking die ze opheffen.
      tel("BoekRegel", await tx.boekRegel.deleteMany({ where: { boeking: { administratieId } } }));
      const tegen = await tx.boekBoeking.deleteMany({ where: { administratieId, keertBoekingId: { not: null } } });
      const rest = await tx.boekBoeking.deleteMany({ where: { administratieId } });
      verwijderd["BoekBoeking"] = tegen.count + rest.count;
      // 3. De instellingen. Rekeningen verwijzen naar elkaar (kopje en kind): eerst die koppeling losmaken.
      tel("BoekVolgnummer", await tx.boekVolgnummer.deleteMany({ where: { administratieId } }));
      tel("BoekPeriode", await tx.boekPeriode.deleteMany({ where: { administratieId } }));
      tel("BoekBtwCode", await tx.boekBtwCode.deleteMany({ where: { administratieId } }));
      await tx.boekRekening.updateMany({ where: { administratieId, parentId: { not: null } }, data: { parentId: null } });
      tel("BoekRekening", await tx.boekRekening.deleteMany({ where: { administratieId } }));
      await tx.boekAdministratie.delete({ where: { id: administratieId } });
      verwijderd["BoekAdministratie"] = 1;
      return { administratieId, verwijderd };
    },
    { timeout: 60_000 },
  );
}
